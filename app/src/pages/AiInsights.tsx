import { useAiInsights, useRefreshAiInsights } from "../hooks/useAiInsights";
import { QueryState } from "../components/QueryState";
import { StatTile } from "../components/StatTile";
import { formatCurrency } from "../lib/format";

const SOURCE_COLOR: Record<string, string> = {
  Advisor: "var(--brand-accent)",
  "VMs paradas": "var(--status-critical)",
  "AKS parados": "var(--status-critical)",
  "Recursos órfãos": "var(--status-warning)",
  "Candidatos à exclusão": "var(--status-warning)",
  "Anomalias de custo": "var(--status-critical)",
  Orçamento: "var(--status-warning)",
  "AKS - dimensionamento": "var(--brand-accent)",
  "App Service - dimensionamento": "var(--brand-accent)",
};

function formatDateTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function AiInsights() {
  const { data, isLoading, error } = useAiInsights();
  const refresh = useRefreshAiInsights();
  const insights = data?.insights ?? [];
  const totalEstimated = insights.reduce((sum, i) => sum + (i.estimatedMonthlySavings ?? 0), 0);
  const currency = insights.find((i) => i.currency)?.currency ?? "BRL";

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div>
          <h1 className="page-title">Insights de IA</h1>
          <p className="page-subtitle">
            Análise priorizada gerada por IA (Azure AI Foundry) a partir dos dados já coletados — custo, orçamentos,
            Advisor, recursos parados/órfãos e candidatos à exclusão. Gerado automaticamente todo dia.
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
          {refresh.isPending ? "Gerando…" : "Gerar agora"}
        </button>
      </div>
      {refresh.isError && (
        <p style={{ fontSize: 12, color: "var(--status-critical)", margin: "8px 0 0" }}>
          Não foi possível gerar a análise agora. Tente novamente em instantes.
        </p>
      )}

      <QueryState isLoading={isLoading} error={error} hasData={!!data}>
        <div className="kpi-grid">
          <StatTile label="Insights identificados" value={String(insights.length)} />
          <StatTile
            label="Economia estimada somada"
            value={formatCurrency(totalEstimated, currency)}
            deltaLabel="soma apenas dos insights com valor estimado"
          />
          <StatTile label="Última geração" value={data?.generatedAt ? formatDateTime(data.generatedAt) : "—"} />
        </div>

        {insights.length === 0 ? (
          <div className="card">
            <p className="state-message">
              Nenhum insight gerado ainda. A rotina roda automaticamente todo dia às 07:15 UTC, ou clique em "Gerar
              agora".
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {insights.map((insight, i) => (
              <div key={i} className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span
                        className="status-pill"
                        style={{ fontSize: 11, color: SOURCE_COLOR[insight.source] ?? "var(--text-muted)" }}
                      >
                        <span
                          className="status-dot"
                          style={{ background: SOURCE_COLOR[insight.source] ?? "var(--text-muted)" }}
                        />
                        {insight.source}
                      </span>
                    </div>
                    <p className="card-title" style={{ marginBottom: 6 }}>
                      {insight.title}
                    </p>
                    <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>
                      {insight.whyItMatters}
                    </p>
                    <p style={{ fontSize: 13, fontWeight: 600 }}>Ação sugerida: {insight.suggestedAction}</p>
                  </div>
                  {insight.estimatedMonthlySavings !== null && (
                    <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Economia estimada/mês</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--status-good)" }}>
                        {formatCurrency(insight.estimatedMonthlySavings, insight.currency ?? currency)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12 }}>
          Gerado por IA a partir apenas dos dados já coletados neste portal — não é uma recomendação financeira, é
          uma priorização automática. Revise antes de agir.
        </p>
      </QueryState>
    </>
  );
}
