import { useResourceSizing, useRefreshResourceSizing } from "../hooks/useResourceSizing";
import { useSummary } from "../hooks/useSummary";
import { QueryState } from "../components/QueryState";
import { StatTile } from "../components/StatTile";
import { formatCurrency } from "../lib/format";
import type { AksNodePoolUtilization, AppServicePlanUtilization } from "../types";

function cpuColor(percent: number | null): string {
  if (percent === null) return "var(--text-muted)";
  if (percent < 20) return "var(--status-critical)";
  if (percent < 40) return "var(--status-warning)";
  return "var(--status-good)";
}

function pct(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

export function ResourceSizing() {
  const { data, isLoading, error } = useResourceSizing();
  const { data: summary } = useSummary();
  const refresh = useRefreshResourceSizing();

  const aksNodePools = data?.aksNodePools ?? [];
  const appServicePlans = data?.appServicePlans ?? [];
  const aksCandidates = aksNodePools.filter((p) => p.resizeRecommendation);
  const appCandidates = appServicePlans.filter((p) => p.resizeRecommendation);
  const currency = aksCandidates[0]?.resizeRecommendation?.currency ?? appCandidates[0]?.resizeRecommendation?.currency ?? "BRL";
  const totalEstimatedSavings = [...aksCandidates, ...appCandidates].reduce(
    (sum, p) => sum + (p.resizeRecommendation?.estimatedMonthlySavings ?? 0),
    0
  );

  const subscriptionName = (id: string) => summary?.bySubscription.find((s) => s.subscriptionId === id)?.subscriptionName ?? id;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div>
          <h1 className="page-title">Redimensionamento — AKS &amp; App Service</h1>
          <p className="page-subtitle">
            Node pools AKS e App Service Plans com CPU (e memória, quando disponível) consistentemente baixa nos
            últimos 30 dias, com sugestão de tamanho menor calculada a partir das specs reais da Azure — nunca
            "chutada".
          </p>
        </div>
        <button
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending}
          style={{
            background: "transparent",
            color: "var(--brand-accent)",
            border: "1px solid var(--brand-accent)",
            borderRadius: 6,
            padding: "6px 12px",
            fontSize: 12.5,
            fontWeight: 600,
            cursor: refresh.isPending ? "default" : "pointer",
            opacity: refresh.isPending ? 0.6 : 1,
            whiteSpace: "nowrap",
          }}
        >
          {refresh.isPending ? "Atualizando…" : "Atualizar agora"}
        </button>
      </div>
      {refresh.isError && (
        <p style={{ fontSize: 12, color: "var(--status-critical)", margin: "8px 0 0" }}>
          Não foi possível atualizar agora. Tente novamente em instantes.
        </p>
      )}

      <QueryState isLoading={isLoading} error={error} hasData={!!data}>
        <div className="kpi-grid">
          <StatTile label="Node pools AKS analisados" value={String(aksNodePools.length)} />
          <StatTile label="App Service Plans analisados" value={String(appServicePlans.length)} />
          <StatTile
            label="Candidatos a redimensionar"
            value={String(aksCandidates.length + appCandidates.length)}
            deltaLabel={aksCandidates.length + appCandidates.length > 0 ? "revisar" : "nenhum"}
            deltaDirection={aksCandidates.length + appCandidates.length > 0 ? "up-bad" : "neutral"}
          />
          <StatTile
            label="Economia estimada/mês"
            value={formatCurrency(totalEstimatedSavings, currency)}
            deltaLabel="se todos forem redimensionados"
            deltaDirection="neutral"
          />
        </div>

        <div className="card" style={{ marginBottom: 18 }}>
          <p className="card-title">Node pools AKS</p>
          {aksNodePools.length === 0 ? (
            <p className="state-message">Nenhum node pool encontrado.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Cluster / node pool</th>
                  <th>Subscription</th>
                  <th>CPU média (30d)</th>
                  <th>Memória média (30d)</th>
                  <th>Tamanho atual</th>
                  <th>Sugestão</th>
                  <th>Economia estimada/mês</th>
                </tr>
              </thead>
              <tbody>
                {aksNodePools
                  .slice()
                  .sort((a, b) => (b.resizeRecommendation ? 1 : 0) - (a.resizeRecommendation ? 1 : 0))
                  .map((p: AksNodePoolUtilization) => (
                    <tr key={`${p.subscriptionId}-${p.clusterName}-${p.poolName}`}>
                      <td>
                        {p.clusterName} <span style={{ color: "var(--text-muted)" }}>/ {p.poolName}</span>
                      </td>
                      <td>{subscriptionName(p.subscriptionId)}</td>
                      <td style={{ color: cpuColor(p.avgCpuPercent) }}>{pct(p.avgCpuPercent)}</td>
                      <td>{pct(p.avgMemoryPercent)}</td>
                      <td>
                        {p.vmSize} <span style={{ color: "var(--text-muted)" }}>({p.nodeCount}x)</span>
                      </td>
                      <td>
                        {p.resizeRecommendation ? (
                          <span style={{ color: "var(--status-good)" }}>
                            → {p.resizeRecommendation.recommendedSize} ({p.resizeRecommendation.recommendedVCpus} vCPU /{" "}
                            {p.resizeRecommendation.recommendedMemoryGB} GB)
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>—</span>
                        )}
                      </td>
                      <td>
                        {p.resizeRecommendation?.estimatedMonthlySavings != null
                          ? formatCurrency(p.resizeRecommendation.estimatedMonthlySavings, p.resizeRecommendation.currency ?? "BRL")
                          : "—"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <p className="card-title">App Service Plans</p>
          {appServicePlans.length === 0 ? (
            <p className="state-message">Nenhum App Service Plan encontrado.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Plano</th>
                  <th>Subscription</th>
                  <th>CPU média (30d)</th>
                  <th>Memória média (30d)</th>
                  <th>Tamanho atual</th>
                  <th>Sugestão</th>
                  <th>Economia estimada/mês</th>
                </tr>
              </thead>
              <tbody>
                {appServicePlans
                  .slice()
                  .sort((a, b) => (b.resizeRecommendation ? 1 : 0) - (a.resizeRecommendation ? 1 : 0))
                  .map((p: AppServicePlanUtilization) => (
                    <tr key={`${p.subscriptionId}-${p.name}`}>
                      <td>{p.name}</td>
                      <td>{subscriptionName(p.subscriptionId)}</td>
                      <td style={{ color: cpuColor(p.avgCpuPercent) }}>{pct(p.avgCpuPercent)}</td>
                      <td>{pct(p.avgMemoryPercent)}</td>
                      <td>
                        {p.size} <span style={{ color: "var(--text-muted)" }}>({p.capacity}x)</span>
                      </td>
                      <td>
                        {p.resizeRecommendation ? (
                          <span style={{ color: "var(--status-good)" }}>
                            → {p.resizeRecommendation.recommendedSize} ({p.resizeRecommendation.recommendedVCpus} vCPU /{" "}
                            {p.resizeRecommendation.recommendedMemoryGB} GB)
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>—</span>
                        )}
                      </td>
                      <td>
                        {p.resizeRecommendation?.estimatedMonthlySavings != null
                          ? formatCurrency(p.resizeRecommendation.estimatedMonthlySavings, p.resizeRecommendation.currency ?? "BRL")
                          : "—"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12 }}>
            Sugestão de tamanho só aparece quando a CPU média dos últimos 30 dias fica abaixo de 20% (e a memória,
            quando disponível, abaixo de 60% — pra não sugerir reduzir algo que na verdade está limitado por
            memória). "Economia estimada/mês" projeta o custo do mês corrente pra um mês cheio e aplica a redução de
            vCPU — é uma estimativa, não um valor de fatura. Planos serverless (Consumption/Flex) não têm um tamanho
            fixo pra redimensionar e por isso não aparecem com sugestão.
          </p>
        </div>
      </QueryState>
    </>
  );
}
