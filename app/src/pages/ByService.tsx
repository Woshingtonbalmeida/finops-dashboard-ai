import { useEffect, useMemo, useState } from "react";
import { useSummary } from "../hooks/useSummary";
import { useServiceTargets, useSaveServiceTargets } from "../hooks/useServiceTargets";
import { RankedBarChart } from "../components/RankedBarChart";
import { QueryState } from "../components/QueryState";
import { formatCurrency } from "../lib/format";
import type { ServiceTarget } from "../types";

const inputStyle: React.CSSProperties = {
  background: "transparent",
  color: "var(--text-primary)",
  border: "none",
  outline: "none",
  padding: "4px 6px",
  fontSize: 13,
  width: 90,
};

const inputWrapStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  background: "var(--surface-1)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  paddingLeft: 8,
};

export function ByService() {
  const { data, isLoading, error } = useSummary();
  const { data: targetsReport } = useServiceTargets();
  const saveTargets = useSaveServiceTargets();
  const [subscriptionFilter, setSubscriptionFilter] = useState<string>("all");
  const [editedTargets, setEditedTargets] = useState<Record<string, string>>({});

  const targetsByKey = useMemo(() => {
    const map = new Map<string, ServiceTarget>();
    for (const t of targetsReport?.targets ?? []) map.set(`${t.subscriptionId}|${t.service}`, t);
    return map;
  }, [targetsReport]);

  // Reset local edits whenever the scope changes (a fresh targets report lands, e.g.
  // after a save, or the user switches which subscription they're editing targets for).
  useEffect(() => {
    setEditedTargets({});
  }, [targetsReport, subscriptionFilter]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return subscriptionFilter === "all"
      ? data.byService
      : data.byServiceBySubscription
          .filter((s) => s.subscriptionId === subscriptionFilter)
          .map((s) => ({ service: s.service, cost: s.cost, forecast: s.forecast }))
          .sort((a, b) => b.cost - a.cost);
  }, [data, subscriptionFilter]);

  const hasUnsavedChanges = Object.keys(editedTargets).length > 0;

  function targetValueFor(service: string): string {
    if (service in editedTargets) return editedTargets[service];
    const existing = targetsByKey.get(`${subscriptionFilter}|${service}`);
    return existing ? String(existing.targetAmount) : "";
  }

  function handleSave() {
    if (!data) return;
    const merged = new Map<string, ServiceTarget>(targetsByKey);
    for (const [service, rawValue] of Object.entries(editedTargets)) {
      const key = `${subscriptionFilter}|${service}`;
      const amount = parseFloat(rawValue);
      if (rawValue.trim() === "" || isNaN(amount)) {
        merged.delete(key);
      } else {
        merged.set(key, { subscriptionId: subscriptionFilter, service, targetAmount: amount, currency: data.currency });
      }
    }
    saveTargets.mutate([...merged.values()]);
  }

  return (
    <>
      <h1 className="page-title">Maiores geradores de custo</h1>
      <p className="page-subtitle">Mês corrente, agregado por ServiceName/ServiceCategory (FOCUS)</p>

      <QueryState isLoading={isLoading} error={error} hasData={!!data && data.byService.length > 0}>
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
                <p className="card-title">Top 15 serviços</p>
                <RankedBarChart
                  data={filtered.map((s) => ({ name: s.service, cost: s.cost }))}
                  currency={data.currency}
                  maxItems={15}
                />
              </div>
            </div>

            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <p className="card-title" style={{ marginBottom: 0 }}>
                  Todos os serviços
                </p>
                <button
                  onClick={handleSave}
                  disabled={!hasUnsavedChanges || saveTargets.isPending}
                  style={{
                    background: hasUnsavedChanges ? "var(--brand-accent)" : "var(--surface-1)",
                    color: hasUnsavedChanges ? "#04141a" : "var(--text-muted)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: "6px 14px",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: hasUnsavedChanges ? "pointer" : "default",
                  }}
                >
                  {saveTargets.isPending ? "Salvando…" : "Salvar metas"}
                </button>
              </div>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: -2, marginBottom: 12 }}>
                Metas são específicas de cada subscription — troque o filtro acima pra definir a meta de{" "}
                {data.bySubscription.map((s) => s.subscriptionName).join(" ou ")}, ou deixe em "Todas as
                subscriptions" pra uma meta consolidada. Quando o forecast passar da meta, a linha fica destacada em
                vermelho.
              </p>
              <table className="table">
                <thead>
                  <tr>
                    <th>Serviço</th>
                    <th>Custo</th>
                    <th>Forecast</th>
                    <th>Target/mês</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => {
                    const target = targetsByKey.get(`${subscriptionFilter}|${s.service}`);
                    const hasTarget = !!target && target.targetAmount > 0;
                    const overTarget = hasTarget && s.forecast > target.targetAmount;
                    const withinTarget = hasTarget && !overTarget;
                    const rowBackground = overTarget
                      ? "rgba(230, 103, 103, 0.12)"
                      : withinTarget
                        ? "rgba(66, 179, 122, 0.10)"
                        : undefined;
                    const forecastColor = overTarget
                      ? "var(--status-critical)"
                      : withinTarget
                        ? "var(--status-good)"
                        : undefined;
                    return (
                      <tr key={s.service} style={rowBackground ? { background: rowBackground } : undefined}>
                        <td>{s.service}</td>
                        <td>{formatCurrency(s.cost, data.currency)}</td>
                        <td style={forecastColor ? { color: forecastColor, fontWeight: 600 } : undefined}>
                          {formatCurrency(s.forecast, data.currency)}
                        </td>
                        <td>
                          <span style={inputWrapStyle}>
                            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>R$</span>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              placeholder="Sem meta"
                              value={targetValueFor(s.service)}
                              onChange={(e) => setEditedTargets((prev) => ({ ...prev, [s.service]: e.target.value }))}
                              style={inputStyle}
                            />
                          </span>
                        </td>
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
