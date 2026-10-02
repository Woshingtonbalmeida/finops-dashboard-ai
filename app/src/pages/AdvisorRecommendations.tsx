import { useOptimization } from "../hooks/useOptimization";
import { useSummary } from "../hooks/useSummary";
import { QueryState } from "../components/QueryState";
import { StatTile } from "../components/StatTile";
import { formatCurrency } from "../lib/format";

function impactColor(impact: string): string {
  if (impact === "High") return "var(--status-critical)";
  if (impact === "Medium") return "var(--status-warning)";
  return "var(--status-good)";
}

export function AdvisorRecommendations() {
  const { data, isLoading, error } = useOptimization();
  const { data: summary } = useSummary();

  // Many Advisor recommendations (reliability/monitoring/etc.) don't carry a
  // quantified savings estimate — keep only the ones that actually project savings.
  const recommendations = (data?.advisorRecommendations ?? []).filter((r) => r.totalAnnualSavingsBilling > 0);
  const totalAnnualSavings = recommendations.reduce((sum, r) => sum + r.totalAnnualSavingsBilling, 0);
  const billingCurrency = recommendations[0]?.billingCurrency ?? "BRL";

  return (
    <>
      <h1 className="page-title">Recomendações do Advisor</h1>
      <p className="page-subtitle">
        Recomendações de custo do Azure Advisor com economia estimada, agrupadas por tipo (como no portal)
      </p>

      <QueryState isLoading={isLoading} error={error} hasData={recommendations.length > 0}>
        <div className="kpi-grid">
          <StatTile label="Economia potencial anual" value={formatCurrency(totalAnnualSavings, billingCurrency)} />
          <StatTile label="Recomendações ativas" value={String(recommendations.length)} />
        </div>

        <div className="card">
          <p className="card-title">Recomendações</p>
          <table className="table">
            <thead>
              <tr>
                <th>Impacto</th>
                <th>Recomendação</th>
                <th>Categoria</th>
                <th>Subscriptions</th>
                <th>Recursos afetados</th>
                <th>Economia anual</th>
              </tr>
            </thead>
            <tbody>
              {recommendations.map((r) => {
                const subNames = r.subscriptionIds
                  .map((id) => summary?.bySubscription.find((s) => s.subscriptionId === id)?.subscriptionName ?? id)
                  .join(", ");
                return (
                  <tr key={r.recommendationTypeId}>
                    <td>
                      <span className="status-pill">
                        <span className="status-dot" style={{ background: impactColor(r.impact) }} />
                        {r.impact}
                      </span>
                    </td>
                    <td>{r.problem}</td>
                    <td>{r.subCategory}</td>
                    <td>{subNames}</td>
                    <td>{r.affectedResourceCount}</td>
                    <td>{formatCurrency(r.totalAnnualSavingsBilling, r.billingCurrency)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12 }}>
            Valores convertidos de USD (moeda nativa do Advisor) para {billingCurrency} usando a cotação implícita
            nas faturas de Reserved Instances.
          </p>
        </div>
      </QueryState>
    </>
  );
}
