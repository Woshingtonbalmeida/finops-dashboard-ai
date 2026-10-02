import { useSummary } from "../hooks/useSummary";
import { useTagCompliance, useRefreshTagCompliance } from "../hooks/useTagCompliance";
import { QueryState } from "../components/QueryState";
import { StatTile } from "../components/StatTile";

const REQUIRED_TAGS = ["PRODUTO", "CLIENTE", "ENV", "OWNER"];

function complianceColor(percent: number): string {
  if (percent >= 80) return "var(--status-good)";
  if (percent >= 50) return "var(--status-warning)";
  return "var(--status-critical)";
}

// Coverage per individual tag uses a lower "good" bar than overall compliance,
// since getting one tag to 70%+ is real progress even before all four line up.
function coverageColor(percent: number): string {
  if (percent >= 70) return "var(--status-good)";
  if (percent >= 40) return "var(--status-warning)";
  return "var(--status-critical)";
}

export function Compliance() {
  const { data: compliance, isLoading, error } = useTagCompliance();
  const { data: summary } = useSummary();
  const refresh = useRefreshTagCompliance();

  const bySubscription = compliance?.bySubscription ?? [];
  const totalResources = bySubscription.reduce((sum, s) => sum + s.totalResources, 0);
  const totalMissing = bySubscription.reduce((sum, s) => sum + s.missingAnyRequiredTag, 0);
  const overallPercent = totalResources > 0 ? ((totalResources - totalMissing) / totalResources) * 100 : 0;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div>
          <h1 className="page-title">Governança de tags</h1>
          <p className="page-subtitle">
            Recursos com todas as tags obrigatórias ({REQUIRED_TAGS.join(", ")}) vs. recursos faltando alguma
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

      <QueryState isLoading={isLoading} error={error} hasData={bySubscription.length > 0}>
        <div className="kpi-grid">
          <StatTile
            label="Compliance geral"
            value={`${overallPercent.toFixed(1)}%`}
            deltaLabel={`${totalResources - totalMissing} de ${totalResources} recursos`}
          />
          {bySubscription.map((s) => {
            const sub = summary?.bySubscription.find((x) => x.subscriptionId === s.subscriptionId);
            const compliant = s.totalResources - s.missingAnyRequiredTag;
            const percent = s.totalResources > 0 ? (compliant / s.totalResources) * 100 : 0;
            return (
              <StatTile
                key={s.subscriptionId}
                label={sub?.subscriptionName ?? s.subscriptionId}
                value={`${percent.toFixed(1)}%`}
                deltaLabel={`${compliant} de ${s.totalResources} recursos`}
              />
            );
          })}
        </div>

        <div className="card" style={{ marginBottom: 18 }}>
          <p className="card-title">Progresso por subscription</p>
          {bySubscription.map((s) => {
            const sub = summary?.bySubscription.find((x) => x.subscriptionId === s.subscriptionId);
            const compliant = s.totalResources - s.missingAnyRequiredTag;
            const percent = s.totalResources > 0 ? (compliant / s.totalResources) * 100 : 0;
            const color = complianceColor(percent);
            return (
              <div key={s.subscriptionId} style={{ marginBottom: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13 }}>
                  <span style={{ color: "var(--text-primary)" }}>{sub?.subscriptionName ?? s.subscriptionId}</span>
                  <span>{percent.toFixed(1)}%</span>
                </div>
                <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 999, height: 8, overflow: "hidden" }}>
                  <div style={{ width: `${percent}%`, background: color, height: "100%", borderRadius: 999 }} />
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
                  {compliant} com todas as tags · {s.missingAnyRequiredTag} faltando pelo menos uma
                </div>
              </div>
            );
          })}
        </div>

        <div className="card">
          <p className="card-title">Recursos faltando cada tag (por subscription)</p>
          <table className="table">
            <thead>
              <tr>
                <th>Tag</th>
                {bySubscription.map((s) => {
                  const sub = summary?.bySubscription.find((x) => x.subscriptionId === s.subscriptionId);
                  return <th key={s.subscriptionId}>{sub?.subscriptionName ?? s.subscriptionId}</th>;
                })}
              </tr>
            </thead>
            <tbody>
              {REQUIRED_TAGS.map((tag) => (
                <tr key={tag}>
                  <td>{tag}</td>
                  {bySubscription.map((s) => (
                    <td key={s.subscriptionId}>{s.missingByTag[tag] ?? 0}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12 }}>
Lido direto do resultado da avaliação da política de tags configurada no Azure (mesmo dado da tela Policy | Compliance do portal) — os números aqui devem bater com os de lá.
          </p>
        </div>

        <div className="card" style={{ marginTop: 18 }}>
          <p className="card-title">Cobertura por tag individual</p>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: -8, marginBottom: 16 }}>
            % de recursos que já têm cada tag aplicada, mesmo que ainda falte outra — complementa o "Compliance
            geral" acima, que só conta como pronto quando as 4 tags estão presentes ao mesmo tempo.
          </p>
          {bySubscription.map((s) => {
            const sub = summary?.bySubscription.find((x) => x.subscriptionId === s.subscriptionId);
            return (
              <div key={s.subscriptionId} style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 10 }}>
                  {sub?.subscriptionName ?? s.subscriptionId}
                </div>
                {REQUIRED_TAGS.map((tag) => {
                  const missing = s.missingByTag[tag] ?? 0;
                  const covered = s.totalResources - missing;
                  const percent = s.totalResources > 0 ? (covered / s.totalResources) * 100 : 0;
                  return (
                    <div
                      key={tag}
                      style={{ display: "grid", gridTemplateColumns: "90px 1fr 130px", alignItems: "center", gap: 10, marginBottom: 8 }}
                    >
                      <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>{tag}</span>
                      <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 999, height: 8, overflow: "hidden" }}>
                        <div
                          style={{ width: `${percent}%`, background: coverageColor(percent), height: "100%", borderRadius: 999 }}
                        />
                      </div>
                      <span style={{ fontSize: 11.5, color: "var(--text-muted)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{percent.toFixed(1)}%</span> · {covered}/
                        {s.totalResources}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </QueryState>
    </>
  );
}
