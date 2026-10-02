import { subscriptionIds } from "../config/client";
import { DefaultAzureCredential } from "@azure/identity";
import { readJsonBlob, writeJsonBlob } from "./storage";
import { CuratedSummary } from "./focus";
import { BudgetsReport } from "./budgets";
import { ForecastReport } from "./forecast";
import { OptimizationReport } from "./optimization";
import { StoppedVMsReport } from "./stoppedVMs";
import { StoppedAksReport } from "./stoppedAks";
import { OrphanedResource } from "./orphanedResources";
import { DeletionCandidate } from "./deletionCandidates";
import { fetchAksNodePoolUtilization, fetchAppServicePlanUtilization, ResizeRecommendation } from "./resourceUtilization";



const credential = new DefaultAzureCredential();

// Model deployment created by the user in their own Azure AI Foundry resource — see
// api/src/lib/version.ts-style comment: no API key stored anywhere, auth is the Function
// App's managed identity against the Cognitive Services resource (role "Cognitive
// Services OpenAI User" granted on that resource, not something this code manages).
const FOUNDRY_ENDPOINT =
  "https://aif-finops-insights-eus2.cognitiveservices.azure.com/openai/deployments/finops-insights/chat/completions?api-version=2025-01-01-preview";

async function getFoundryToken(): Promise<string> {
  const token = await credential.getToken("https://cognitiveservices.azure.com/.default");
  if (!token) throw new Error("Não foi possível obter token de acesso para Azure AI Foundry");
  return token.token;
}

export interface AiInsight {
  title: string;
  whyItMatters: string;
  suggestedAction: string;
  estimatedMonthlySavings: number | null;
  currency: string | null;
  source: string;
}

export interface AiInsightsReport {
  generatedAt: string;
  insights: AiInsight[];
  model: string;
}

const VALID_SOURCES = [
  "Advisor",
  "VMs paradas",
  "AKS parados",
  "Recursos órfãos",
  "Candidatos à exclusão",
  "Anomalias de custo",
  "Orçamento",
  "AKS - dimensionamento",
  "App Service - dimensionamento",
];

const SYSTEM_PROMPT = `Você é um analista de FinOps sênior revisando o ambiente Azure de uma empresa.
Você recebe um resumo em JSON com dados de custo, orçamento, anomalias e oportunidades já coletados automaticamente (Azure Advisor, VMs/clusters parados, recursos órfãos, candidatos à exclusão, utilização de node pools AKS e de App Service Plans).

Tarefa: produza uma lista priorizada de até 8 insights/ações em português, focando no que mais vale a pena revisar essa semana.

Regras estritas:
- Use APENAS os números e fatos presentes no JSON fornecido. NUNCA invente, estime ou arredonde valores que não estejam explicitamente nos dados.
- Se não houver um valor financeiro claro para um insight, use estimatedMonthlySavings: null (não chute um número).
- O campo "source" deve ser EXATAMENTE um destes valores, sem variação: ${VALID_SOURCES.map((s) => `"${s}"`).join(", ")}.
- Dados em "aksNodePools" e "appServicePlans": os campos de CPU/memória (cpuMedio30diasPercent, memoriaMedia30diasPercent) são médias reais de 30 dias vindas do Azure Monitor/Container Insights. Utilização consistentemente baixa (ex: abaixo de 20-25%) é candidata a redimensionamento. Quando "recomendacaoResize" não for null, é um cálculo determinístico já feito pelo backend (não é um chute) — cite o "tamanhoRecomendado" e, se presente, "economiaEstimadaMes" diretamente. Quando "recomendacaoResize" for null, NUNCA invente um SKU/tamanho de destino — sugira apenas de forma direcional (ex: "considere uma classe de VM ou tier menor") sem citar um valor específico. Se um campo de utilização for null, não há dado suficiente pra aquela dimensão — não opine sobre ela.
- Em "aksNodePools", "modeloCompra" é "Spot" ou "Regular" — node pools "Regular" com carga tolerante a interrupção (dev/test, batch) são candidatos a migrar para Spot (desconto grande, mas cite isso só se o nome/contexto sugerir não ser produção crítica). "tipoDiscoOs" é "Ephemeral" (sem custo de disco gerenciado) ou "Managed" — um node pool "Managed" com baixa necessidade de persistência no OS disk é candidato a Ephemeral. "skuDiscoOs" (quando não-null) mostra o tier real do disco (Premium_LRS/StandardSSD_LRS/Standard_LRS).
- Se houver MAIS DE UM node pool AKS ou App Service Plan claramente subutilizado, NÃO crie um insight por recurso — agrupe todos num único insight por categoria ("AKS - dimensionamento" / "App Service - dimensionamento"), citando os principais casos (nome + %CPU) na descrição, pra não ocupar várias das 8 vagas com itens parecidos.
- Priorize por impacto financeiro estimado (maior primeiro), mas garanta que recursos claramente subutilizados (AKS/App Service com CPU muito baixa) apareçam na lista mesmo sem valor financeiro estimado, e considere também urgência (orçamento perto de estourar, anomalia recente).
- Responda SOMENTE com um objeto JSON válido, sem markdown e sem texto fora do JSON, no formato exato:
{"insights": [{"title": string, "whyItMatters": string, "suggestedAction": string, "estimatedMonthlySavings": number | null, "currency": string | null, "source": string}]}`;

interface InsightsDataPayload {
  moeda: string;
  gastoMesAtual: number;
  gastoMesAnterior: number;
  previsaoFechamentoPorSubscription: { subscription: string; valor: number; moeda: string }[];
  orcamentos: { subscription: string; orcamento: number; gastoAtual: number; percentualUsado: number | null; moeda: string }[];
  anomaliasRecentes: { data: string; subscription: string; servico: string; custoAtual: number; custoBase: number; desvioPercent: number | null }[];
  recomendacoesAdvisor: { problema: string; categoria: string; impacto: string; recursosAfetados: number; economiaAnualEstimada: number; moeda: string }[];
  vmsParadas: { nome: string; subscription: string; custoResidualMes: number; economiaEstimadaSemana: number; moeda: string }[];
  clustersAksParados: { nome: string; subscription: string; custoResidualMes: number; economiaEstimadaSemana: number; moeda: string }[];
  recursosOrfaos: { nome: string; tipo: string; subscription: string; custoMes: number; moeda: string }[];
  candidatosExclusaoIdentificados: { nome: string; tipo: string; subscription: string; custoMes: number; moeda: string }[];
  aksNodePools: {
    cluster: string;
    nodePool: string;
    subscription: string;
    vmSize: string;
    quantidadeNodes: number;
    cpuMedio30diasPercent: number | null;
    memoriaMedia30diasPercent: number | null;
    modeloCompra: string;
    tipoDiscoOs: string;
    skuDiscoOs: string | null;
    recomendacaoResize: ResizeRecommendationPayload | null;
  }[];
  appServicePlans: {
    nome: string;
    subscription: string;
    tier: string;
    tamanho: string;
    instancias: number;
    cpuMedio30diasPercent: number | null;
    memoriaMedia30diasPercent: number | null;
    recomendacaoResize: ResizeRecommendationPayload | null;
  }[];
}

interface ResizeRecommendationPayload {
  tamanhoRecomendado: string;
  vCpuAtual: number;
  vCpuRecomendado: number;
  memoriaAtualGB: number;
  memoriaRecomendadaGB: number;
  economiaEstimadaMes: number | null;
  moeda: string | null;
}

async function buildInsightsPayload(onWarn?: (message: string) => void): Promise<InsightsDataPayload> {
  const [summary, budgets, forecast, optimization, stoppedVMs, stoppedAks, orphaned, deletionCandidates, aksNodePools, appServicePlans] =
    await Promise.all([
      readJsonBlob<CuratedSummary>("curated", "summary.json"),
      readJsonBlob<BudgetsReport>("curated", "budgets.json"),
      readJsonBlob<ForecastReport>("curated", "forecast.json"),
      readJsonBlob<OptimizationReport>("curated", "optimization.json"),
      readJsonBlob<StoppedVMsReport>("curated", "stopped-vms.json"),
      readJsonBlob<StoppedAksReport>("curated", "stopped-aks.json"),
      readJsonBlob<{ resources: OrphanedResource[] }>("curated", "orphaned-resources.json"),
      readJsonBlob<{ resources: DeletionCandidate[] }>("curated", "deletion-candidates.json"),
      fetchAksNodePoolUtilization(subscriptionIds(), onWarn).catch((err) => {
        onWarn?.(`Falha ao buscar utilização de node pools AKS: ${(err as Error).message}`);
        return [];
      }),
      fetchAppServicePlanUtilization(subscriptionIds(), onWarn).catch((err) => {
        onWarn?.(`Falha ao buscar utilização de App Service Plans: ${(err as Error).message}`);
        return [];
      }),
    ]);

  const subscriptionName = (id: string) => summary?.bySubscription.find((s) => s.subscriptionId === id)?.subscriptionName ?? id;

  return {
    moeda: summary?.currency ?? "BRL",
    gastoMesAtual: summary?.totalMtdCost ?? 0,
    gastoMesAnterior: summary?.totalPriorMonthCostToDate ?? 0,
    previsaoFechamentoPorSubscription: (forecast?.bySubscription ?? []).map((f) => ({
      subscription: subscriptionName(f.subscriptionId),
      valor: f.forecastAmount,
      moeda: f.currency,
    })),
    orcamentos: (budgets?.budgets ?? []).map((b) => ({
      subscription: subscriptionName(b.subscriptionId),
      orcamento: b.amount,
      gastoAtual: b.currentSpend,
      percentualUsado: b.amount > 0 ? Math.round((b.currentSpend / b.amount) * 1000) / 10 : null,
      moeda: b.currency,
    })),
    // Últimos 10 dias, mais recentes primeiro — a rotina diária já mantém 30 dias de
    // histórico, mas só a janela recente importa para uma leitura semanal.
    anomaliasRecentes: (summary?.anomalies ?? [])
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 15)
      .map((a) => ({
        data: a.date,
        subscription: a.subscriptionName,
        servico: a.service,
        custoAtual: a.actualCost,
        custoBase: a.baselineCost,
        desvioPercent: a.deviationPercent,
      })),
    recomendacoesAdvisor: (optimization?.advisorRecommendations ?? []).map((r) => ({
      problema: r.problem,
      categoria: r.subCategory,
      impacto: r.impact,
      recursosAfetados: r.affectedResourceCount,
      economiaAnualEstimada: r.totalAnnualSavingsBilling,
      moeda: r.billingCurrency,
    })),
    vmsParadas: (stoppedVMs?.vms ?? [])
      .slice()
      .sort((a, b) => b.mtdCost - a.mtdCost)
      .map((vm) => ({
        nome: vm.name,
        subscription: subscriptionName(vm.subscriptionId),
        custoResidualMes: vm.mtdCost,
        economiaEstimadaSemana: vm.weeklyRealizedSavings.amount,
        moeda: vm.currency,
      })),
    clustersAksParados: (stoppedAks?.clusters ?? [])
      .slice()
      .sort((a, b) => b.mtdCost - a.mtdCost)
      .map((c) => ({
        nome: c.name,
        subscription: subscriptionName(c.subscriptionId),
        custoResidualMes: c.mtdCost,
        economiaEstimadaSemana: c.weeklyRealizedSavings.amount,
        moeda: c.currency,
      })),
    // Ambas as listas de detecção incluem muitos recursos de custo zero (hygiene —
    // interfaces de rede, conexões, etc.) que não interessam pra uma análise financeira e
    // só inflam o payload/custo da chamada — filtra pra só o que tem custo real, maiores
    // primeiro, e limita a 20 pra não estourar o prompt em ambientes com centenas deles.
    recursosOrfaos: (orphaned?.resources ?? [])
      .filter((r) => r.mtdCost > 0)
      .sort((a, b) => b.mtdCost - a.mtdCost)
      .slice(0, 20)
      .map((r) => ({
        nome: r.name,
        tipo: r.type,
        subscription: subscriptionName(r.subscriptionId),
        custoMes: r.mtdCost,
        moeda: r.currency,
      })),
    candidatosExclusaoIdentificados: (deletionCandidates?.resources ?? [])
      .filter((r) => r.mtdCost > 0)
      .sort((a, b) => b.mtdCost - a.mtdCost)
      .slice(0, 20)
      .map((r) => ({
        nome: r.name,
        tipo: r.type,
        subscription: subscriptionName(r.subscriptionId),
        custoMes: r.mtdCost,
        moeda: r.currency,
      })),
    aksNodePools: aksNodePools.map((p) => ({
      cluster: p.clusterName,
      nodePool: p.poolName,
      subscription: subscriptionName(p.subscriptionId),
      vmSize: p.vmSize,
      quantidadeNodes: p.nodeCount,
      cpuMedio30diasPercent: p.avgCpuPercent,
      memoriaMedia30diasPercent: p.avgMemoryPercent,
      modeloCompra: p.scaleSetPriority,
      tipoDiscoOs: p.osDiskType,
      skuDiscoOs: p.osDiskSku,
      recomendacaoResize: toResizePayload(p.resizeRecommendation),
    })),
    appServicePlans: appServicePlans.map((p) => ({
      nome: p.name,
      subscription: subscriptionName(p.subscriptionId),
      tier: p.tier,
      tamanho: p.size,
      instancias: p.capacity,
      cpuMedio30diasPercent: p.avgCpuPercent,
      memoriaMedia30diasPercent: p.avgMemoryPercent,
      recomendacaoResize: toResizePayload(p.resizeRecommendation),
    })),
  };
}

function toResizePayload(r: ResizeRecommendation | null): ResizeRecommendationPayload | null {
  if (!r) return null;
  return {
    tamanhoRecomendado: r.recommendedSize,
    vCpuAtual: r.currentVCpus,
    vCpuRecomendado: r.recommendedVCpus,
    memoriaAtualGB: r.currentMemoryGB,
    memoriaRecomendadaGB: r.recommendedMemoryGB,
    economiaEstimadaMes: r.estimatedMonthlySavings,
    moeda: r.currency,
  };
}

// Defense in depth: the prompt already pins "source" to an exact vocabulary, but the
// model has drifted before (used the raw payload key "aksNodePools" instead of the
// instructed label) — normalize known near-misses instead of showing a raw field name.
const SOURCE_ALIASES: Record<string, string> = {
  aksnodepools: "AKS - dimensionamento",
  appserviceplans: "App Service - dimensionamento",
};

function normalizeSource(source: string): string {
  const exact = VALID_SOURCES.find((s) => s.toLowerCase() === source.toLowerCase());
  if (exact) return exact;
  return SOURCE_ALIASES[source.toLowerCase().replace(/[^a-z]/g, "")] ?? source;
}

function isValidInsight(value: unknown): value is AiInsight {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.title === "string" &&
    typeof v.whyItMatters === "string" &&
    typeof v.suggestedAction === "string" &&
    (v.estimatedMonthlySavings === null || typeof v.estimatedMonthlySavings === "number") &&
    (v.currency === null || typeof v.currency === "string") &&
    typeof v.source === "string"
  );
}

async function callFoundry(payload: InsightsDataPayload): Promise<{ insights: AiInsight[]; model: string }> {
  const token = await getFoundryToken();
  const response = await fetch(FOUNDRY_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(payload) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 2000,
    }),
  });
  if (!response.ok) {
    throw new Error(`Azure AI Foundry -> ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as { model?: string; choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("Resposta do modelo sem conteúdo de texto");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Resposta do modelo não é um JSON válido");
  }
  const rawInsights = (parsed as { insights?: unknown }).insights;
  if (!Array.isArray(rawInsights)) {
    throw new Error("Resposta do modelo não trouxe um array 'insights'");
  }

  const insights = rawInsights
    .filter(isValidInsight)
    .slice(0, 8)
    .map((i) => ({ ...i, source: normalizeSource(i.source) }));
  return { insights, model: data.model ?? "finops-insights" };
}

// Shared by the daily timer and the on-demand HTTP refresh, same pattern as every other
// refreshXNow in this codebase. A failure here (model unavailable, quota, bad JSON) leaves
// the report empty rather than throwing, so the rest of the daily refresh chain and the
// page itself degrade gracefully instead of erroring out.
export async function refreshAiInsightsNow(onWarn?: (message: string) => void): Promise<AiInsightsReport> {
  const now = new Date().toISOString();
  const payload = await buildInsightsPayload(onWarn);
  try {
    const { insights, model } = await callFoundry(payload);
    const report: AiInsightsReport = { generatedAt: now, insights, model };
    await writeJsonBlob("curated", "ai-insights.json", report);
    return report;
  } catch (err) {
    onWarn?.(`Falha ao gerar insights de IA: ${(err as Error).message}`);
    const report: AiInsightsReport = { generatedAt: now, insights: [], model: "" };
    await writeJsonBlob("curated", "ai-insights.json", report);
    return report;
  }
}
