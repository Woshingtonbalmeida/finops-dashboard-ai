import { useStoppedAks, useRefreshStoppedAks } from "../hooks/useStoppedAks";
import { useSummary } from "../hooks/useSummary";
import { QueryState } from "../components/QueryState";
import { StatTile } from "../components/StatTile";
import { formatCurrency } from "../lib/format";

export function StoppedAks() {
  const { data, isLoading, error } = useStoppedAks();
  const { data: summary } = useSummary();
  const refresh = useRefreshStoppedAks();
  const clusters = data?.clusters ?? [];
  const weeklySavingsTotal = clusters.reduce((sum, c) => sum + c.weeklyRealizedSavings.amount, 0);
  const weeklySavingsCurrency = clusters[0]?.weeklyRealizedSavings.currency ?? data?.currency ?? "BRL";

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div>
          <h1 className="page-title">AKS parados</h1>
          <p className="page-subtitle">
            Clusters AKS parados via "az aks stop" — os nós já não custam compute, mas o cluster continua existindo
            (e o control plane Standard/Premium continua sendo cobrado).
          </p>
        </div>
        <button
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending}
          style={{
            background: "transparent",
            color: "var(--brand-accent)",
            border: "1px solid var(--brand-accent)",
            borderRadius: 8,
            padding: "8px 14px",
            fontSize: 13,
            cursor: refresh.isPending ? "default" : "pointer",
            opacity: refresh.isPending ? 0.6 : 1,
            whiteSpace: "nowrap",
          }}
        >
          {refresh.isPending ? "Atualizando…" : "Atualizar agora"}
        </button>
      </div>
      {refresh.isSuccess && (
        <p style={{ fontSize: 12, color: "var(--status-good)", margin: "8px 0 0" }}>
          Clusters atualizados a partir do Azure — {refresh.data.clusters.length} cluster(s) parado(s) encontrado(s).
        </p>
      )}
      {refresh.isError && (
        <p style={{ fontSize: 12, color: "var(--status-critical)", margin: "8px 0 0" }}>
          Não foi possível atualizar agora. Tente novamente em instantes.
        </p>
      )}

      <QueryState isLoading={isLoading} error={error} hasData={!!data}>
        <div className="kpi-grid">
          <StatTile label="Clusters parados" value={String(clusters.length)} />
          <StatTile
            label="Custo residual no mês"
            value={formatCurrency(data?.totalMtdCost ?? 0, data?.currency ?? "BRL")}
            deltaLabel="control plane, discos e IPs que continuam ativos"
          />
          <StatTile
            label="Economia estimada nesta semana"
            value={formatCurrency(weeklySavingsTotal, weeklySavingsCurrency)}
            deltaLabel="vs. o que custaria se estivessem rodando"
            deltaDirection={weeklySavingsTotal > 0 ? "down-good" : "neutral"}
          />
        </div>

        <div className="card">
          <p className="card-title">Clusters</p>
          {clusters.length === 0 ? (
            <p className="state-message">Nenhum cluster AKS parado no momento.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Subscription</th>
                  <th>Resource group</th>
                  <th>Localização</th>
                  <th>Tier</th>
                  <th>Custo no mês</th>
                  <th>Economia esta semana</th>
                </tr>
              </thead>
              <tbody>
                {clusters.map((cluster) => {
                  const sub = summary?.bySubscription.find((s) => s.subscriptionId === cluster.subscriptionId);
                  return (
                    <tr key={cluster.resourceId}>
                      <td>{cluster.name}</td>
                      <td>{sub?.subscriptionName ?? cluster.subscriptionId}</td>
                      <td>{cluster.resourceGroup}</td>
                      <td>{cluster.location}</td>
                      <td>{cluster.tier}</td>
                      <td>{formatCurrency(cluster.mtdCost, cluster.currency)}</td>
                      <td style={cluster.weeklyRealizedSavings.amount > 0 ? { color: "var(--status-good)", fontWeight: 600 } : undefined}>
                        {formatCurrency(cluster.weeklyRealizedSavings.amount, cluster.weeklyRealizedSavings.currency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12 }}>
            Detectados via Azure Resource Graph pelo campo powerState do cluster (o mesmo que "az aks stop" seta).
            Tier Free não cobra control plane; Standard/Premium continuam cobrando mesmo com todos os nós parados.
            "Economia esta semana" estima quanto o cluster já deixou de custar nos últimos 7 dias, comparando com a
            taxa diária que ele tinha enquanto ainda estava rodando neste mês.
          </p>
        </div>
      </QueryState>
    </>
  );
}
