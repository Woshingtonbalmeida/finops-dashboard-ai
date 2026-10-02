import { useMemo } from "react";
import { useSummary } from "../hooks/useSummary";
import { useBudgets } from "../hooks/useBudgets";
import { useForecast } from "../hooks/useForecast";
import { useDeletionStatusHistory } from "../hooks/useDeletionStatusHistory";
import { useStoppedAks } from "../hooks/useStoppedAks";
import { useStoppedVMs } from "../hooks/useStoppedVMs";
import { useUnifiedOpportunities } from "../hooks/useUnifiedOpportunities";
import { QueryState } from "../components/QueryState";
import { StatTile } from "../components/StatTile";
import { PrintButton } from "../components/PrintButton";
import { formatCurrency, formatPercent } from "../lib/format";

interface UnifiedAction {
  key: string;
  changedAt: string;
  resourceName: string;
  subscriptionName: string;
  changeLabel: string;
  cost: number;
  currency: string;
  isRealizedSaving: boolean;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

// "Excluído" here means the resource stopped existing entirely (deleted while it was
// stopped) — distinct from "Retomado" (it started running again). Both look the same as
// "disappeared from the stopped list" at the data level; stoppedAks.ts/stoppedVMs.ts tell
// them apart by checking whether the resource still exists in Azure at all.
function stopActionLabel(action: "Parado" | "Retomado" | "Excluído"): string {
  if (action === "Parado") return "Rodando → Parado";
  if (action === "Excluído") return "Parado → Excluído";
  return "Parado → Rodando";
}

type BudgetStatusLevel = "good" | "warning" | "critical" | "unknown";

function budgetStatusLevel(percentUsed: number | null): BudgetStatusLevel {
  if (percentUsed === null) return "unknown";
  if (percentUsed <= 95) return "good";
  if (percentUsed <= 100) return "warning";
  return "critical";
}

const STATUS_LABEL: Record<BudgetStatusLevel, string> = {
  good: "Dentro do planejado",
  warning: "Perto do limite",
  critical: "Acima do orçamento",
  unknown: "Sem budget configurado",
};

const STATUS_COLOR: Record<BudgetStatusLevel, string> = {
  good: "var(--status-good)",
  warning: "var(--status-warning)",
  critical: "var(--status-critical)",
  unknown: "var(--text-muted)",
};

interface SubscriptionBudgetStatus {
  subscriptionId: string;
  subscriptionName: string;
  percentUsed: number | null;
  statusLevel: BudgetStatusLevel;
}

export function WeeklyReport() {
  const { data: summary, isLoading, error } = useSummary();
  const { data: budgets } = useBudgets();
  const { data: forecast } = useForecast();
  const { data: statusHistory } = useDeletionStatusHistory();
  const { data: stoppedAks } = useStoppedAks();
  const { data: stoppedVMs } = useStoppedVMs();
  const { opportunities } = useUnifiedOpportunities();

  const today = summary ? new Date(summary.generatedAt) : new Date();
  const weekStart = new Date(today);
  weekStart.setUTCDate(weekStart.getUTCDate() - 6);

  // Um status por subscription, não um número agregado só — dois budgets estourados em
  // graus diferentes viram uma média morna que esconde que os dois precisam de atenção.
  const subscriptionBudgetStatuses: SubscriptionBudgetStatus[] = useMemo(() => {
    if (!budgets || !summary) return [];
    return budgets.budgets.map((b) => {
      const sub = summary.bySubscription.find((s) => s.subscriptionId === b.subscriptionId);
      const effectiveSpend = sub?.cost ?? b.currentSpend;
      const percentUsed = b.amount > 0 ? Math.round((effectiveSpend / b.amount) * 1000) / 10 : null;
      return {
        subscriptionId: b.subscriptionId,
        subscriptionName: sub?.subscriptionName ?? b.subscriptionId,
        percentUsed,
        statusLevel: budgetStatusLevel(percentUsed),
      };
    });
  }, [budgets, summary]);

  const totalForecast = forecast?.bySubscription.reduce((sum, f) => sum + f.forecastAmount, 0) ?? 0;
  const forecastCurrency = forecast?.bySubscription[0]?.currency ?? summary?.currency ?? "BRL";

  // Três fontes bem diferentes de "ação tomada" — mudança de status em Candidatos à
  // exclusão (o usuário clica num select), e parar/retomar um cluster AKS ou uma VM
  // (detectado comparando o snapshot de hoje com o de ontem) — mas a diretoria só quer
  // ver "o que foi feito essa semana", então unificamos numa lista só. Para AKS/VM, o
  // valor mostrado como economia é o `weeklyRealizedSavings` calculado no momento (taxa
  // diária de quando o recurso ainda rodava x dias parado dentro da semana do relatório),
  // buscado no snapshot atual de cada recurso — não o custo residual do evento em si.
  const recentActions: UnifiedAction[] = useMemo(() => {
    const cutoff = new Date(today);
    cutoff.setUTCDate(cutoff.getUTCDate() - 7);

    const aksSavingsById = new Map((stoppedAks?.clusters ?? []).map((c) => [c.resourceId.toLowerCase(), c.weeklyRealizedSavings]));
    const vmSavingsById = new Map((stoppedVMs?.vms ?? []).map((v) => [v.resourceId.toLowerCase(), v.weeklyRealizedSavings]));

    // "Excluído" is only the user declaring the resource gone — weeklyRealizedSavings
    // (computed daily from real cost data, see refreshDeletionSavingsNow) confirms the
    // cost actually dropped before counting it. Falls back to the monthlyCost snapshot
    // captured at the click until the next daily refresh verifies it.
    const deletionActions: UnifiedAction[] = (statusHistory?.history ?? []).map((h) => {
      const savings = h.status === "Excluído" ? h.weeklyRealizedSavings : undefined;
      return {
        key: `del-${h.resourceId}-${h.changedAt}`,
        changedAt: h.changedAt,
        resourceName: h.resourceName,
        subscriptionName: h.subscriptionName,
        changeLabel: h.previousStatus ? `${h.previousStatus} → ${h.status}` : h.status,
        cost: savings ? savings.amount : h.monthlyCost,
        currency: savings ? savings.currency : h.currency,
        isRealizedSaving: h.status === "Excluído" && (savings ? savings.amount > 0 : true),
      };
    });

    const aksActions: UnifiedAction[] = (stoppedAks?.history ?? []).map((h) => {
      const savings = h.action === "Parado" ? aksSavingsById.get(h.resourceId.toLowerCase()) : undefined;
      return {
        key: `aks-${h.resourceId}-${h.changedAt}`,
        changedAt: h.changedAt,
        resourceName: h.clusterName,
        subscriptionName: h.subscriptionName,
        changeLabel: stopActionLabel(h.action),
        cost: savings ? savings.amount : h.mtdCost,
        currency: savings ? savings.currency : h.currency,
        isRealizedSaving: h.action === "Excluído" || (!!savings && savings.amount > 0),
      };
    });

    const vmActions: UnifiedAction[] = (stoppedVMs?.history ?? []).map((h) => {
      const savings = h.action === "Parado" ? vmSavingsById.get(h.resourceId.toLowerCase()) : undefined;
      return {
        key: `vm-${h.resourceId}-${h.changedAt}`,
        changedAt: h.changedAt,
        resourceName: h.vmName,
        subscriptionName: h.subscriptionName,
        changeLabel: stopActionLabel(h.action),
        cost: savings ? savings.amount : h.mtdCost,
        currency: savings ? savings.currency : h.currency,
        isRealizedSaving: h.action === "Excluído" || (!!savings && savings.amount > 0),
      };
    });

    return [...deletionActions, ...aksActions, ...vmActions]
      .filter((a) => new Date(a.changedAt) >= cutoff)
      .sort((a, b) => (a.changedAt < b.changedAt ? 1 : -1));
  }, [statusHistory, stoppedAks, stoppedVMs, today]);

  const realizedSavings = recentActions.filter((a) => a.isRealizedSaving).reduce((sum, a) => sum + a.cost, 0);

  const topOpportunities = opportunities.slice(0, 5);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div>
          <h1 className="page-title">Relatório executivo semanal</h1>
          <p className="page-subtitle">
            Visão fechada da semana pra diretoria — quanto gastamos, o que mudou, quais ações foram tomadas e o
            resultado delas.
          </p>
        </div>
        <PrintButton />
      </div>

      <QueryState isLoading={isLoading} error={error} hasData={!!summary}>
        {summary && (
          <>
            <div className="card" style={{ marginBottom: 18 }}>
              <p className="card-title-accent">Relatório executivo FinOps</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13 }}>
                <div>
                  <span style={{ color: "var(--text-muted)" }}>Período: </span>
                  {formatDate(weekStart)} a {formatDate(today)}
                </div>
                <div>
                  <span style={{ color: "var(--text-muted)" }}>Escopo: </span>
                  Assinaturas {summary.bySubscription.map((s) => s.subscriptionName).join(" e ")}
                </div>
                <div>
                  <span style={{ color: "var(--text-muted)" }}>Moeda: </span>
                  {summary.currency}
                </div>
                <div>
                  <span style={{ color: "var(--text-muted)" }}>Dados atualizados em: </span>
                  {formatDateTime(summary.generatedAt)}
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <span style={{ color: "var(--text-muted)" }}>Status geral: </span>
                  {subscriptionBudgetStatuses.length === 0 ? (
                    <span className="status-pill">
                      <span className="status-dot" style={{ background: STATUS_COLOR.unknown }} />
                      {STATUS_LABEL.unknown}
                    </span>
                  ) : (
                    <div style={{ display: "inline-flex", flexWrap: "wrap", gap: 8, verticalAlign: "middle" }}>
                      {subscriptionBudgetStatuses.map((s) => (
                        <span key={s.subscriptionId} className="status-pill">
                          <span className="status-dot" style={{ background: STATUS_COLOR[s.statusLevel] }} />
                          {s.subscriptionName}: {STATUS_LABEL[s.statusLevel]}
                          {s.percentUsed !== null ? ` (${s.percentUsed.toFixed(1)}%)` : ""}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 14, marginBottom: 0 }}>
                Os valores de custo refletem o fechamento de D-1 (dia anterior) — o Azure leva até 24h para
                consolidar o consumo do dia corrente. Já as ações da seção "Ações realizadas nesta semana" aparecem
                em tempo real, assim que o status é alterado.
              </p>
            </div>

            <div className="kpi-grid">
              <StatTile
                label="Custo dos últimos 7 dias"
                value={formatCurrency(summary.weeklyReport.thisWeekCost, summary.weeklyReport.currency)}
                deltaLabel={
                  summary.weeklyReport.variancePercent !== null
                    ? `${formatPercent(summary.weeklyReport.variancePercent)} vs. semana anterior`
                    : "sem base de comparação"
                }
                deltaDirection={
                  summary.weeklyReport.variancePercent === null
                    ? "neutral"
                    : summary.weeklyReport.variancePercent > 0
                      ? "up-bad"
                      : "down-good"
                }
              />
              <StatTile label="Custo acumulado no mês" value={formatCurrency(summary.totalMtdCost, summary.currency)} />
              <StatTile label="Previsão de fechamento" value={formatCurrency(totalForecast, forecastCurrency)} />
              <StatTile
                label="Economia validada nesta semana"
                value={formatCurrency(realizedSavings, summary.currency)}
                deltaLabel={`${recentActions.filter((a) => a.isRealizedSaving).length} ação/ações com economia confirmada`}
                deltaDirection={realizedSavings > 0 ? "down-good" : "neutral"}
              />
            </div>

            <div className="card" style={{ marginBottom: 18 }}>
              <p className="card-title-accent">O que mudou nos últimos 7 dias</p>
              <div style={{ fontSize: 13, fontFamily: "monospace" }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ color: "var(--text-secondary)" }}>Custo da semana anterior</span>
                  <span>{formatCurrency(summary.weeklyReport.lastWeekCost, summary.weeklyReport.currency)}</span>
                </div>
                {summary.weeklyReport.topIncreases.map((m) => (
                  <div key={`inc-${m.subscriptionId}-${m.service}`} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                    <span style={{ color: "var(--text-muted)" }}>
                      + {m.service} <span style={{ fontSize: 11 }}>({m.subscriptionName})</span>
                    </span>
                    <span style={{ color: "var(--status-critical)" }}>+{formatCurrency(m.delta, summary.weeklyReport.currency)}</span>
                  </div>
                ))}
                {summary.weeklyReport.topDecreases.map((m) => (
                  <div key={`dec-${m.subscriptionId}-${m.service}`} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                    <span style={{ color: "var(--text-muted)" }}>
                      − {m.service} <span style={{ fontSize: 11 }}>({m.subscriptionName})</span>
                    </span>
                    <span style={{ color: "var(--status-good)" }}>{formatCurrency(m.delta, summary.weeklyReport.currency)}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: "1px solid var(--border)", fontWeight: 700 }}>
                  <span>Custo da semana atual</span>
                  <span>{formatCurrency(summary.weeklyReport.thisWeekCost, summary.weeklyReport.currency)}</span>
                </div>
              </div>
            </div>

            <div className="card" style={{ marginBottom: 18 }}>
              <p className="card-title-accent">Ações realizadas nesta semana</p>
              {recentActions.length === 0 ? (
                <p className="state-message">Nenhuma ação registrada nesta semana.</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Recurso</th>
                      <th>Subscription</th>
                      <th>Mudança</th>
                      <th>Custo/mês</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentActions.map((a) => (
                      <tr key={a.key}>
                        <td>{formatDate(new Date(a.changedAt))}</td>
                        <td>{a.resourceName}</td>
                        <td>{a.subscriptionName}</td>
                        <td>{a.changeLabel}</td>
                        <td style={a.isRealizedSaving ? { color: "var(--status-good)", fontWeight: 600 } : undefined}>
                          {formatCurrency(a.cost, a.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12 }}>
                Combina mudanças de status em "Candidatos à exclusão" e VMs/clusters AKS parados ou retomados
                (detectados comparando o snapshot de custo de cada dia). Em ambos os casos, o valor mostrado e
                somado na economia da semana é verificado contra o custo real do recurso: a taxa diária que ele
                tinha enquanto ainda rodava neste mês, comparada com quantos dias ele ficou com custo próximo de
                zero dentro desta semana — se a exclusão foi marcada mas o recurso ainda não parou de custar, a
                economia aparece como R$ 0,00 até a próxima verificação diária confirmar a queda.
              </p>
            </div>

            <div className="card">
              <p className="card-title-accent">Principais oportunidades pendentes</p>
              {topOpportunities.length === 0 ? (
                <p className="state-message">Nenhuma oportunidade identificada no momento.</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Fonte</th>
                      <th>Descrição</th>
                      <th>Subscription</th>
                      <th>Economia/mês</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topOpportunities.map((o) => (
                      <tr key={o.key}>
                        <td>{o.source}</td>
                        <td>{o.description}</td>
                        <td>{o.subscriptionName}</td>
                        <td>{formatCurrency(o.monthlySavings, o.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </QueryState>
    </>
  );
}
