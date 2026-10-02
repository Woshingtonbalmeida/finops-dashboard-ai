import { useSqlSecurity, useRefreshSqlSecurity } from "../hooks/useSqlSecurity";
import { useSummary } from "../hooks/useSummary";
import { QueryState } from "../components/QueryState";
import { StatTile } from "../components/StatTile";

function tlsColor(version: string): string {
  if (!version || version === "1.2") return "var(--status-good)";
  return "var(--status-critical)"; // 1.0/1.1, or an explicit "None" — weaker than platform default
}

function publicAccessColor(access: string): string {
  return access === "Enabled" ? "var(--status-critical)" : "var(--status-good)";
}

export function SqlSecurity() {
  const { data, isLoading, error } = useSqlSecurity();
  const { data: summary } = useSummary();
  const refresh = useRefreshSqlSecurity();

  const servers = data?.servers ?? [];
  const databases = data?.databases ?? [];
  const publicServers = servers.filter((s) => s.publicNetworkAccess === "Enabled").length;
  const weakTlsServers = servers.filter((s) => s.minimalTlsVersion && s.minimalTlsVersion !== "1.2").length;

  const subscriptionName = (id: string) => summary?.bySubscription.find((s) => s.subscriptionId === id)?.subscriptionName ?? id;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div>
          <h1 className="page-title">Conformidade e Segurança — SQL Database</h1>
          <p className="page-subtitle">
            Acesso público, TLS mínimo e configuração de capacidade de todos os SQL Servers e databases das duas
            subscriptions.
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
          <StatTile label="SQL Servers" value={String(servers.length)} />
          <StatTile
            label="Com acesso público habilitado"
            value={String(publicServers)}
            deltaLabel={publicServers > 0 ? "avaliar restringir" : "nenhum exposto"}
            deltaDirection={publicServers > 0 ? "up-bad" : "neutral"}
          />
          <StatTile
            label="Com TLS abaixo de 1.2"
            value={String(weakTlsServers)}
            deltaLabel={weakTlsServers > 0 ? "atualizar versão mínima" : "todos em 1.2+"}
            deltaDirection={weakTlsServers > 0 ? "up-bad" : "neutral"}
          />
          <StatTile label="Databases" value={String(databases.length)} />
        </div>

        <div className="card" style={{ marginBottom: 18 }}>
          <p className="card-title">SQL Servers</p>
          {servers.length === 0 ? (
            <p className="state-message">Nenhum SQL Server encontrado.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Subscription</th>
                  <th>Resource group</th>
                  <th>Acesso público</th>
                  <th>TLS mínimo</th>
                  <th>FQDN</th>
                </tr>
              </thead>
              <tbody>
                {servers.map((s) => (
                  <tr key={`${s.subscriptionId}-${s.name}`}>
                    <td>{s.name}</td>
                    <td>{subscriptionName(s.subscriptionId)}</td>
                    <td>{s.resourceGroup}</td>
                    <td>
                      <span className="status-pill">
                        <span className="status-dot" style={{ background: publicAccessColor(s.publicNetworkAccess) }} />
                        {s.publicNetworkAccess || "Desconhecido"}
                      </span>
                    </td>
                    <td>
                      <span className="status-pill">
                        <span className="status-dot" style={{ background: tlsColor(s.minimalTlsVersion) }} />
                        {s.minimalTlsVersion || "Padrão (1.2)"}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{s.fqdn}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <p className="card-title">Databases</p>
          {databases.length === 0 ? (
            <p className="state-message">Nenhum database encontrado.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Server</th>
                  <th>Subscription</th>
                  <th>Status</th>
                  <th>Zona de disponibilidade</th>
                  <th>Capacidade mín.</th>
                  <th>Capacidade</th>
                  <th>Tier</th>
                  <th>Hardware</th>
                  <th>Tamanho máx. (GB)</th>
                </tr>
              </thead>
              <tbody>
                {databases.map((d) => (
                  <tr key={`${d.subscriptionId}-${d.serverName}-${d.name}`}>
                    <td>{d.name}</td>
                    <td>{d.serverName}</td>
                    <td>{subscriptionName(d.subscriptionId)}</td>
                    <td>
                      <span className="status-pill">
                        <span
                          className="status-dot"
                          style={{ background: d.status === "Online" ? "var(--status-good)" : "var(--status-warning)" }}
                        />
                        {d.status || "—"}
                      </span>
                    </td>
                    <td>{d.zoneRedundant ? "Sim" : "Não"}</td>
                    <td>{d.minCapacity ?? "—"}</td>
                    <td>{d.skuCapacity ?? "—"}</td>
                    <td>{d.skuTier || "—"}</td>
                    <td>{d.skuName || "—"}</td>
                    <td>{d.maxSizeGB ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12 }}>
            "Capacidade mín." só se aplica a databases no modelo serverless (vCore) — vazio significa capacidade fixa
            (sem escala automática) ou modelo DTU. "Hardware" é o nome do SKU (ex: GP_S_Gen5, Standard) que indica a
            geração/família de hardware por trás do tier.
          </p>
        </div>
      </QueryState>
    </>
  );
}
