import { useSecurity } from "../hooks/useSecurity";
import { useSummary } from "../hooks/useSummary";
import { QueryState } from "../components/QueryState";
import { StatTile } from "../components/StatTile";
import type { Severity } from "../types";

function scoreColor(percent: number): string {
  if (percent >= 70) return "var(--status-good)";
  if (percent >= 40) return "var(--status-warning)";
  return "var(--status-critical)";
}

function severityColor(sev: string): string {
  if (sev === "High") return "var(--status-critical)";
  if (sev === "Medium") return "var(--status-warning)";
  if (sev === "Low") return "var(--status-good)";
  return "var(--text-muted)"; // Informational
}

export function Security() {
  const { data: security, isLoading, error } = useSecurity();
  const { data: summary } = useSummary();

  const bySubscription = security?.bySubscription ?? [];
  const avgScore = bySubscription.length
    ? bySubscription.reduce((sum, s) => sum + s.secureScorePercent, 0) / bySubscription.length
    : 0;
  const totalUnhealthy = bySubscription.reduce((sum, s) => sum + s.unhealthyCount, 0);
  const totalAlerts = bySubscription.reduce((sum, s) => sum + s.alerts.length, 0);
  const totalHigh = bySubscription.reduce((sum, s) => sum + s.bySeverity.High, 0);

  return (
    <>
      <h1 className="page-title">Segurança</h1>
      <p className="page-subtitle">
        Secure Score, alertas ativos, compliance regulatório e severidade das recomendações — Microsoft Defender for
        Cloud, por subscription.
      </p>

      <QueryState isLoading={isLoading} error={error} hasData={bySubscription.length > 0}>
        <div className="kpi-grid">
          <StatTile label="Secure Score médio" value={`${avgScore.toFixed(1)}%`} />
          <StatTile label="Recomendações não resolvidas" value={String(totalUnhealthy)} />
          <StatTile
            label="Recomendações de alta severidade"
            value={String(totalHigh)}
            deltaLabel={totalHigh > 0 ? "priorizar essas primeiro" : undefined}
            deltaDirection={totalHigh > 0 ? "up-bad" : "neutral"}
          />
          <StatTile label="Alertas de segurança ativos (30 dias)" value={String(totalAlerts)} />
        </div>

        <div className="two-col" style={{ marginBottom: 18 }}>
          {bySubscription.map((s) => {
            const sub = summary?.bySubscription.find((x) => x.subscriptionId === s.subscriptionId);
            const sevTotal = s.bySeverity.High + s.bySeverity.Medium + s.bySeverity.Low;
            return (
              <div className="card" key={s.subscriptionId}>
                <p className="card-title">{sub?.subscriptionName ?? s.subscriptionId}</p>

                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13 }}>
                  <span style={{ color: "var(--text-primary)" }}>Secure Score</span>
                  <span>
                    {s.secureScorePercent.toFixed(1)}% ({s.secureScoreCurrent.toFixed(1)}/{s.secureScoreMax})
                  </span>
                </div>
                <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 999, height: 8, overflow: "hidden", marginBottom: 14 }}>
                  <div
                    style={{
                      width: `${s.secureScorePercent}%`,
                      background: scoreColor(s.secureScorePercent),
                      height: "100%",
                      borderRadius: 999,
                    }}
                  />
                </div>

                <p className="card-title" style={{ marginBottom: 6 }}>
                  Recomendações por severidade
                </p>
                {sevTotal > 0 && (
                  <div style={{ display: "flex", height: 10, borderRadius: 999, overflow: "hidden", marginBottom: 6, gap: 2 }}>
                    {(["High", "Medium", "Low"] as const).map((sev) => (
                      <div
                        key={sev}
                        style={{
                          width: `${(s.bySeverity[sev] / sevTotal) * 100}%`,
                          background: severityColor(sev),
                        }}
                        title={`${sev}: ${s.bySeverity[sev]}`}
                      />
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: "var(--text-secondary)", marginBottom: 14 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "var(--status-critical)" }} />
                    Alta: {s.bySeverity.High}
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "var(--status-warning)" }} />
                    Média: {s.bySeverity.Medium}
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "var(--status-good)" }} />
                    Baixa: {s.bySeverity.Low}
                  </span>
                </div>

                <p className="card-title" style={{ marginBottom: 6 }}>
                  Compliance regulatório
                </p>
                {s.regulatoryCompliance ? (
                  <p style={{ fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 14 }}>
                    {s.regulatoryCompliance.standard}:{" "}
                    <strong style={{ color: "var(--text-primary)" }}>{s.regulatoryCompliance.percent.toFixed(1)}%</strong>{" "}
                    ({s.regulatoryCompliance.passed}/{s.regulatoryCompliance.total} controles)
                  </p>
                ) : (
                  <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 14 }}>
                    Não disponível — Defender for Cloud está no plano gratuito nesta subscription (precisa do plano
                    standard pago para mapear compliance regulatório).
                  </p>
                )}

                <p className="card-title" style={{ marginBottom: 6 }}>
                  Alertas ativos (30 dias)
                </p>
                {s.alerts.length === 0 ? (
                  <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 14 }}>Nenhum alerta.</p>
                ) : (
                  <div style={{ marginBottom: 14 }}>
                    {s.alerts.map((a) => (
                      <div key={`${a.name}-${a.severity}`} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, fontSize: 12.5 }}>
                        <span className="status-dot" style={{ background: severityColor(a.severity), flexShrink: 0 }} />
                        <span style={{ color: "var(--text-secondary)" }}>
                          {a.name} {a.count > 1 ? `(x${a.count})` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <p className="card-title" style={{ marginBottom: 8 }}>
                  Principais achados de configuração
                </p>
                {s.topFindings.length === 0 ? (
                  <p style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Nenhum achado pendente.</p>
                ) : (
                  s.topFindings.map((f: { name: string; severity: Severity }) => (
                    <div key={f.name} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 12.5 }}>
                      <span className="status-dot" style={{ background: severityColor(f.severity), flexShrink: 0 }} />
                      <span style={{ color: "var(--text-secondary)" }}>{f.name}</span>
                    </div>
                  ))
                )}
              </div>
            );
          })}
        </div>
      </QueryState>
    </>
  );
}
