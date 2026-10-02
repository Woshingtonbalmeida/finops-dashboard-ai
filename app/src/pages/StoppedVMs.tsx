import { useStoppedVMs, useRefreshStoppedVMs } from "../hooks/useStoppedVMs";
import { useSummary } from "../hooks/useSummary";
import { QueryState } from "../components/QueryState";
import { StatTile } from "../components/StatTile";
import { formatCurrency } from "../lib/format";

function statusColor(powerState: string): string {
  return powerState.startsWith("Stopped") ? "var(--status-critical)" : "var(--status-warning)";
}

export function StoppedVMs() {
  const { data, isLoading, error } = useStoppedVMs();
  const { data: summary } = useSummary();
  const refreshStoppedVMs = useRefreshStoppedVMs();
  const vms = data?.vms ?? [];
  const weeklySavingsTotal = vms.reduce((sum, vm) => sum + vm.weeklyRealizedSavings.amount, 0);
  const weeklySavingsCurrency = vms[0]?.weeklyRealizedSavings.currency ?? data?.currency ?? "BRL";

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div>
          <h1 className="page-title">VMs paradas</h1>
          <p className="page-subtitle">
            Máquinas virtuais desligadas (Stopped ou Deallocated) — avalie se ainda fazem sentido ou podem ser
            removidas
          </p>
        </div>
        {data && (
          <button
            onClick={() => refreshStoppedVMs.mutate()}
            disabled={refreshStoppedVMs.isPending}
            style={{
              background: "transparent",
              color: "var(--brand-accent)",
              border: "1px solid var(--brand-accent)",
              borderRadius: 6,
              padding: "6px 12px",
              fontSize: 12.5,
              fontWeight: 600,
              cursor: refreshStoppedVMs.isPending ? "default" : "pointer",
              opacity: refreshStoppedVMs.isPending ? 0.6 : 1,
              whiteSpace: "nowrap",
            }}
          >
            {refreshStoppedVMs.isPending ? "Atualizando…" : "Atualizar agora"}
          </button>
        )}
      </div>

      <QueryState isLoading={isLoading} error={error} hasData={!!data}>
        <div className="kpi-grid">
          <StatTile label="VMs desligadas" value={String(vms.length)} />
          <StatTile
            label="Custo residual no mês"
            value={formatCurrency(data?.totalMtdCost ?? 0, data?.currency ?? "BRL")}
            deltaLabel="discos, IPs e outros recursos ainda anexados"
          />
          <StatTile
            label="Economia estimada nesta semana"
            value={formatCurrency(weeklySavingsTotal, weeklySavingsCurrency)}
            deltaLabel="vs. o que custaria se estivessem rodando"
            deltaDirection={weeklySavingsTotal > 0 ? "down-good" : "neutral"}
          />
        </div>

        <div className="card">
          <p className="card-title">Máquinas virtuais</p>
          {vms.length === 0 ? (
            <p className="state-message">Nenhuma VM parada no momento.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Subscription</th>
                  <th>Resource group</th>
                  <th>Localização</th>
                  <th>SO</th>
                  <th>Tamanho</th>
                  <th>Status</th>
                  <th>Discos anexados</th>
                  <th>Custo no mês</th>
                  <th>Economia esta semana</th>
                </tr>
              </thead>
              <tbody>
                {vms.map((vm) => {
                  const sub = summary?.bySubscription.find((s) => s.subscriptionId === vm.subscriptionId);
                  return (
                    <tr key={vm.resourceId}>
                      <td>{vm.name}</td>
                      <td>{sub?.subscriptionName ?? vm.subscriptionId}</td>
                      <td>{vm.resourceGroup}</td>
                      <td>{vm.location}</td>
                      <td>{vm.osType}</td>
                      <td>{vm.vmSize}</td>
                      <td>
                        <span className="status-pill">
                          <span className="status-dot" style={{ background: statusColor(vm.powerState) }} />
                          {vm.powerState}
                        </span>
                      </td>
                      <td>{vm.attachedDiskCount}</td>
                      <td>{formatCurrency(vm.mtdCost, vm.currency)}</td>
                      <td style={vm.weeklyRealizedSavings.amount > 0 ? { color: "var(--status-good)", fontWeight: 600 } : undefined}>
                        {formatCurrency(vm.weeklyRealizedSavings.amount, vm.weeklyRealizedSavings.currency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12 }}>
            "Deallocated" não cobra compute, mas discos e IPs anexados continuam sendo cobrados. "Stopped" (sem
            desalocar) ainda cobra compute normalmente — vale desligar/desalocar de verdade. "Economia esta semana"
            estima quanto cada VM já deixou de custar nos últimos 7 dias, comparando com a taxa diária que ela
            tinha enquanto ainda estava rodando neste mês.
          </p>
        </div>
      </QueryState>
    </>
  );
}
