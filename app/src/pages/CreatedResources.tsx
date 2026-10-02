import { subscriptionsLabel } from "../config/brand";
import { useMemo } from "react";
import { useCreatedResources, useRefreshCreatedResources } from "../hooks/useCreatedResources";
import { QueryState } from "../components/QueryState";
import { StatTile } from "../components/StatTile";
import type { CreatedResourceEntry } from "../types";

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function typeLabel(type: string): string {
  return type.replace(/^microsoft\./i, "");
}

// Azure's official display name for a subscription is often unwieldy, e.g.
// "Microsoft Azure (nickname): #1234567" — pulling out just the parenthesized part keeps
// the table narrow enough to fit without horizontal scrolling. A plain name has no parentheses and
// passes through unchanged.
function shortSubscriptionLabel(name: string): string {
  const match = name.match(/\(([^)]+)\)/);
  return match ? match[1] : name;
}

const STATUS_COLOR: Record<CreatedResourceEntry["status"], string> = {
  Ativo: "var(--status-good)",
  Excluído: "var(--text-muted)",
};

// "User" comes from Azure already as the person's e-mail/UPN — human-readable as-is.
// "Application"/"ManagedIdentity" are service principals identified only by a GUID, which
// isn't meaningful to show without a Microsoft Graph lookup this dashboard doesn't have
// access to, so it's labeled generically instead of showing a raw ID.
function creatorLabel(r: CreatedResourceEntry): string {
  if (!r.createdByType) return "—";
  if (r.createdByType === "User") return r.createdBy ?? "Usuário";
  if (r.createdByType === "System") return "Sistema (Azure)";
  if (r.createdByType === "Application" || r.createdByType === "ManagedIdentity") return "Automação (app/pipeline)";
  return r.createdByType;
}

export function CreatedResources() {
  const { data, isLoading, error } = useCreatedResources();
  const refresh = useRefreshCreatedResources();

  const resources = data?.resources ?? [];
  const recent = useMemo(
    () =>
      resources
        .filter((r) => r.dateSource === "azure" && r.createdAt)
        .sort((a, b) => (b.createdAt as string).localeCompare(a.createdAt as string)),
    [resources]
  );

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div>
          <h1 className="page-title">Recurso criado</h1>
          <p className="page-subtitle">
            Nome, tipo, data e autor dos recursos criados a partir de agora — {subscriptionsLabel()} —
            exclui recursos internos de AKS (grupos MC_*) e Databricks, cujas VMs/discos/NICs são recriados
            automaticamente por autoscaling e não representam criação real.
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
        <div className="kpi-grid kpi-grid-centered">
          <StatTile
            label="Criados nos últimos 14 dias"
            value={String(recent.length)}
            subLabel="data e autor reais da Azure (Change History)"
          />
          <StatTile label="Ainda ativos" value={String(recent.filter((r) => r.status === "Ativo").length)} />
          <StatTile label="Já excluídos" value={String(recent.filter((r) => r.status === "Excluído").length)} />
        </div>

        <div className="card">
          <p className="card-title">Criados recentemente</p>
          {recent.length === 0 ? (
            <p className="state-message">Nenhum recurso novo detectado nos últimos 14 dias.</p>
          ) : (
            <table className="table table-spacious">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Tipo</th>
                  <th>Resource group</th>
                  <th>Subscription</th>
                  <th>Região</th>
                  <th>Criado em</th>
                  <th>Criado por</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.resourceId}>
                    <td>{r.name}</td>
                    <td>{typeLabel(r.type)}</td>
                    <td>{r.resourceGroup}</td>
                    <td>{shortSubscriptionLabel(r.subscriptionName)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{r.location}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{formatDateTime(r.createdAt as string)}</td>
                    <td>{creatorLabel(r)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <span className="status-pill" title={r.deletedAt ? `Excluído em ${formatDateTime(r.deletedAt)}` : undefined}>
                        <span className="status-dot" style={{ background: STATUS_COLOR[r.status] }} />
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12 }}>
            Data e autor reais, obtidos via Azure Resource Graph Change History — a Azure só guarda ~14 dias desse
            histórico, por isso só entram aqui recursos criados dentro dessa janela. Quando criado por uma pessoa,
            "Criado por" mostra o e-mail dela; quando por automação (pipeline, app), a Azure só identifica por um ID
            técnico sem nome, então mostramos apenas "Automação". Um recurso continua registrado aqui mesmo depois de
            excluído — o "Status" só muda para "Excluído", a linha não desaparece.
          </p>
        </div>
      </QueryState>
    </>
  );
}
