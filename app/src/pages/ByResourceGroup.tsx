import { useMemo, useState } from "react";
import { useSummary } from "../hooks/useSummary";
import { RankedBarChart } from "../components/RankedBarChart";
import { QueryState } from "../components/QueryState";
import { formatCurrency } from "../lib/format";

export function ByResourceGroup() {
  const { data, isLoading, error } = useSummary();
  const [subscriptionFilter, setSubscriptionFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    if (!data) return [];
    return subscriptionFilter === "all"
      ? data.byResourceGroup
      : data.byResourceGroup.filter((rg) => rg.subscriptionId === subscriptionFilter);
  }, [data, subscriptionFilter]);

  return (
    <>
      <h1 className="page-title">Custos por grupo de recursos</h1>
      <p className="page-subtitle">Mês corrente, derivado do ResourceId de cada linha do FOCUS export</p>

      <QueryState isLoading={isLoading} error={error} hasData={!!data && data.byResourceGroup.length > 0}>
        {data && (
          <>
            <div style={{ marginBottom: 16 }}>
              <select
                value={subscriptionFilter}
                onChange={(e) => setSubscriptionFilter(e.target.value)}
                style={{
                  background: "var(--surface-1)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  padding: "6px 10px",
                  fontSize: 13,
                }}
              >
                <option value="all">Todas as subscriptions</option>
                {data.bySubscription.map((s) => (
                  <option key={s.subscriptionId} value={s.subscriptionId}>
                    {s.subscriptionName}
                  </option>
                ))}
              </select>
            </div>

            <div className="charts-grid">
              <div className="card">
                <p className="card-title">Top 15 resource groups</p>
                <RankedBarChart
                  data={filtered.map((rg) => ({ name: rg.resourceGroup, cost: rg.cost }))}
                  currency={data.currency}
                  maxItems={15}
                />
              </div>
            </div>

            <div className="card">
              <p className="card-title">Detalhamento</p>
              <table className="table">
                <thead>
                  <tr>
                    <th>Resource group</th>
                    <th>Subscription</th>
                    <th>Custo</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((rg) => {
                    const sub = data.bySubscription.find((s) => s.subscriptionId === rg.subscriptionId);
                    return (
                      <tr key={`${rg.subscriptionId}-${rg.resourceGroup}`}>
                        <td>{rg.resourceGroup}</td>
                        <td>{sub?.subscriptionName ?? rg.subscriptionId}</td>
                        <td>{formatCurrency(rg.cost, data.currency)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </QueryState>
    </>
  );
}
