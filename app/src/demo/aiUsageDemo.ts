import type { AiTokenType, AiUsageByModel, AiUsageByResource, AiUsageMonth, AiUsageReport } from '../types'

// Fictitious Azure OpenAI usage for the demo build (VITE_DEMO=true). Nothing here comes from a real
// tenant: subscriptions, resources and volumes are invented, and the numbers are derived
// from the volumes so every chart and table on the page stays internally consistent.

// BRL per 1M tokens, by model and token type.
const PRICES: Record<string, Partial<Record<AiTokenType, number>>> = {
  'gpt-4.1': { input: 11, output: 44, 'cached-input': 2.75 },
  'gpt-4o': { input: 13.75, output: 55, 'cached-input': 6.9 },
  'gpt-4o-mini': { input: 0.83, output: 3.3, 'cached-input': 0.41 },
  'o3-mini': { input: 6.05, output: 24.2, 'cached-input': 3.03 },
  'text-embedding-3-large': { outro: 0.72 },
}

// Share of a model's tokens per token type.
const MIX: Record<string, Partial<Record<AiTokenType, number>>> = {
  'gpt-4.1': { input: 0.62, output: 0.18, 'cached-input': 0.2 },
  'gpt-4o': { input: 0.6, output: 0.22, 'cached-input': 0.18 },
  'gpt-4o-mini': { input: 0.55, output: 0.15, 'cached-input': 0.3 },
  'o3-mini': { input: 0.45, output: 0.45, 'cached-input': 0.1 },
  'text-embedding-3-large': { outro: 1 },
}

interface DemoResource {
  name: string
  subscription: string
  /** Full-month tokens, in millions, per model. */
  monthlyMTokens: Record<string, number>
}

const SUBSCRIPTIONS = ['Produção', 'Homologação', 'Dados & Analytics']

const RESOURCES: DemoResource[] = [
  { name: 'aoai-atendimento-prd', subscription: 'Produção', monthlyMTokens: { 'gpt-4o': 420, 'gpt-4o-mini': 1800 } },
  { name: 'aoai-copiloto-vendas-prd', subscription: 'Produção', monthlyMTokens: { 'gpt-4.1': 310, 'gpt-4o-mini': 650 } },
  { name: 'aoai-juridico-prd', subscription: 'Produção', monthlyMTokens: { 'gpt-4.1': 240, 'o3-mini': 90 } },
  { name: 'aoai-rag-documentos-prd', subscription: 'Produção', monthlyMTokens: { 'gpt-4o': 180, 'text-embedding-3-large': 2600 } },
  { name: 'aoai-triagem-chamados-prd', subscription: 'Produção', monthlyMTokens: { 'gpt-4o-mini': 1350 } },
  { name: 'aoai-agente-financeiro-prd', subscription: 'Produção', monthlyMTokens: { 'o3-mini': 160, 'gpt-4.1': 75 } },
  { name: 'aoai-sumarizacao-reunioes', subscription: 'Produção', monthlyMTokens: { 'gpt-4o-mini': 520, 'gpt-4o': 60 } },
  { name: 'aoai-busca-semantica', subscription: 'Dados & Analytics', monthlyMTokens: { 'text-embedding-3-large': 3900, 'gpt-4o-mini': 210 } },
  { name: 'aoai-classificacao-notas', subscription: 'Dados & Analytics', monthlyMTokens: { 'gpt-4o-mini': 880 } },
  { name: 'aoai-analise-contratos', subscription: 'Dados & Analytics', monthlyMTokens: { 'gpt-4.1': 120, 'o3-mini': 45 } },
  { name: 'aoai-atendimento-hml', subscription: 'Homologação', monthlyMTokens: { 'gpt-4o': 35, 'gpt-4o-mini': 140 } },
  { name: 'aoai-copiloto-vendas-hml', subscription: 'Homologação', monthlyMTokens: { 'gpt-4.1': 28, 'gpt-4o-mini': 60 } },
  { name: 'aoai-experimentos-dev', subscription: 'Homologação', monthlyMTokens: { 'o3-mini': 22, 'gpt-4o': 14, 'gpt-4.1': 9 } },
]

// Usage multiplier for each of the last six months, oldest first: adoption keeps growing.
const GROWTH = [0.48, 0.57, 0.66, 0.78, 0.9, 1]

function costOf(model: string, tokenType: AiTokenType, tokens: number): number {
  return ((PRICES[model][tokenType] ?? 0) * tokens) / 1_000_000
}

/** Splits a full month of one resource's usage into (model, token type) rows, scaled. */
function rowsFor(resource: DemoResource, scale: number): AiUsageByModel[] {
  const rows: AiUsageByModel[] = []
  for (const [model, mTokens] of Object.entries(resource.monthlyMTokens)) {
    for (const [tokenType, share] of Object.entries(MIX[model]) as [AiTokenType, number][]) {
      const tokens = Math.round(mTokens * 1_000_000 * share * scale)
      rows.push({ model, tokenType, tokens, cost: costOf(model, tokenType, tokens) })
    }
  }
  return rows
}

const sum = (rows: { cost: number; tokens: number }[]) =>
  rows.reduce((acc, r) => ({ cost: acc.cost + r.cost, tokens: acc.tokens + r.tokens }), { cost: 0, tokens: 0 })

export function buildDemoAiUsage(): AiUsageReport {
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  // Never show a nearly empty month, even on day 1: pretend at least ten days have passed.
  const elapsed = Math.max(now.getUTCDate(), 10) / daysInMonth

  const byResource: AiUsageByResource[] = []
  const byModelKey = new Map<string, AiUsageByModel>()
  for (const resource of RESOURCES) {
    const rows = rowsFor(resource, elapsed)
    const total = sum(rows)
    byResource.push({
      resourceId: `/subscriptions/demo-${SUBSCRIPTIONS.indexOf(resource.subscription)}/resourceGroups/rg-ia/providers/Microsoft.CognitiveServices/accounts/${resource.name}`,
      resourceName: resource.name,
      subscriptionId: `demo-${SUBSCRIPTIONS.indexOf(resource.subscription)}`,
      subscriptionName: resource.subscription,
      cost: total.cost,
      tokens: total.tokens,
    })
    for (const row of rows) {
      const key = `${row.model}|${row.tokenType}`
      const entry = byModelKey.get(key) ?? { model: row.model, tokenType: row.tokenType, cost: 0, tokens: 0 }
      entry.cost += row.cost
      entry.tokens += row.tokens
      byModelKey.set(key, entry)
    }
  }

  const fullMonth = sum(RESOURCES.flatMap((r) => rowsFor(r, 1)))
  const monthly: AiUsageMonth[] = GROWTH.map((growth, i) => {
    const d = new Date(Date.UTC(year, month - (GROWTH.length - 1 - i), 1))
    const isCurrent = i === GROWTH.length - 1
    const scale = isCurrent ? elapsed : growth
    return {
      yearMonth: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
      cost: fullMonth.cost * scale,
      tokens: Math.round(fullMonth.tokens * scale),
    }
  })

  const mtd = sum(byResource)
  return {
    generatedAt: now.toISOString(),
    currency: 'BRL',
    totalMtdCost: mtd.cost,
    totalMtdTokens: mtd.tokens,
    totalMtdForecast: mtd.cost / elapsed,
    // Prior month ran at GROWTH[-2]; the same days of it cost that share of the full month.
    totalPriorMonthCostToDate: fullMonth.cost * GROWTH[GROWTH.length - 2] * elapsed,
    byResource: byResource.sort((a, b) => b.cost - a.cost),
    byModel: [...byModelKey.values()].sort((a, b) => b.cost - a.cost),
    monthly,
  }
}
