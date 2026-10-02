import { useMemo } from "react";
import { useSummary } from "../hooks/useSummary";
import { QueryState } from "../components/QueryState";
import { StatTile } from "../components/StatTile";
import { formatCurrency, formatPercent } from "../lib/format";

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}

export function CostAnomalies() {
  const { data, isLoading, error } = useSummary();
  const anomalies = data?.anomalies ?? [];

  const affectedServices = useMemo(() => new Set(anomalies.map((a) => `${a.subscriptionId}|${a.service}`)).size, [anomalies]);
  const biggestDeviation = anomalies.reduce((max, a) => Math.max(max, a.deviationAmount), 0);

  return (
    <>
      <h1 className="page-title">Anomalias de custo</h1>
      <p className="page-subtitle">
        Dias em que um serviço gastou bem mais que o esperado — comparado com a média dos 7 dias anteriores do
        mesmo serviço/subscription. Só entra na lista quando o desvio passa de 50% E R$ 100 ao mesmo tempo, pra
        evitar ruído de serviços pequenos.
      </p>

      <QueryState isLoading={isLoading} error={error} hasData={!!data}>
        <div className="kpi-grid">
          <StatTile label="Anomalias detectadas" value={String(anomalies.length)} deltaLabel="últimos ~23 dias" />
          <StatTile
            label="Maior desvio"
            value={formatCurrency(biggestDeviation, data?.currency ?? "BRL")}
            deltaLabel="acima do esperado, num único dia"
          />
          <StatTile label="Serviços afetados" value={String(affectedServices)} />
        </div>

        <div className="card">
          <p className="card-title">Anomalias detectadas</p>
          {anomalies.length === 0 ? (
            <p className="state-message">Nenhuma anomalia nos últimos 30 dias — gasto dentro do esperado.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Serviço</th>
                  <th>Subscription</th>
                  <th>Custo do dia</th>
                  <th>Média esperada (7d)</th>
                  <th>Desvio</th>
                </tr>
              </thead>
              <tbody>
                {anomalies.map((a) => (
                  <tr key={`${a.date}-${a.subscriptionId}-${a.service}`}>
                    <td>{formatDate(a.date)}</td>
                    <td>{a.service}</td>
                    <td>{a.subscriptionName}</td>
                    <td style={{ color: "var(--status-critical)", fontWeight: 600 }}>
                      {formatCurrency(a.actualCost, data?.currency ?? "BRL")}
                    </td>
                    <td style={{ color: "var(--text-muted)" }}>{formatCurrency(a.baselineCost, data?.currency ?? "BRL")}</td>
                    <td>
                      {a.deviationPercent === null ? (
                        <span style={{ color: "var(--status-critical)" }}>novo</span>
                      ) : (
                        <span style={{ color: "var(--status-critical)" }}>{formatPercent(a.deviationPercent)}</span>
                      )}{" "}
                      <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                        (+{formatCurrency(a.deviationAmount, data?.currency ?? "BRL")})
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12 }}>
            Calculado a partir do mesmo export FOCUS diário já usado no resto do dashboard — sem chamada extra à
            Azure. "Novo" aparece quando o serviço não tinha custo nos 7 dias anteriores.
          </p>
        </div>
      </QueryState>
    </>
  );
}
