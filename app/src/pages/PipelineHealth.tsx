import { useMemo } from "react";
import { usePipelineHealth } from "../hooks/usePipelineHealth";
import { QueryState } from "../components/QueryState";
import { StatTile } from "../components/StatTile";
import type { PipelineHealthEntry } from "../types";

const STATUS_COLOR: Record<PipelineHealthEntry["status"], string> = {
  ok: "var(--status-good)",
  atencao: "var(--status-warning)",
  critico: "var(--status-critical)",
};

const STATUS_LABEL: Record<PipelineHealthEntry["status"], string> = {
  ok: "Em dia",
  atencao: "Atenção",
  critico: "Crítico",
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "Nunca rodou";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function formatAge(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 1) return `${Math.round(hours * 60)} min atrás`;
  if (hours < 48) return `${hours.toFixed(1)} h atrás`;
  return `${(hours / 24).toFixed(1)} dias atrás`;
}

export function PipelineHealth() {
  const { data, isLoading, error, refetch, isFetching } = usePipelineHealth();
  const entries = data?.entries ?? [];
  const counts = useMemo(
    () => ({
      ok: entries.filter((e) => e.status === "ok").length,
      atencao: entries.filter((e) => e.status === "atencao").length,
      critico: entries.filter((e) => e.status === "critico").length,
    }),
    [entries]
  );

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div>
          <h1 className="page-title">Saúde da coleta</h1>
          <p className="page-subtitle">
            Última execução bem-sucedida de cada pipeline de dados que alimenta o dashboard — pra detectar uma
            coleta travada antes que alguém precise reparar num print de outra pessoa.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          style={{
            background: "transparent",
            color: "var(--brand-accent)",
            border: "1px solid var(--brand-accent)",
            borderRadius: 6,
            padding: "6px 12px",
            fontSize: 12.5,
            fontWeight: 600,
            cursor: isFetching ? "default" : "pointer",
            opacity: isFetching ? 0.6 : 1,
            whiteSpace: "nowrap",
          }}
        >
          {isFetching ? "Verificando…" : "Verificar agora"}
        </button>
      </div>

      <QueryState isLoading={isLoading} error={error} hasData={!!data}>
        <div className="kpi-grid">
          <StatTile label="Pipelines monitorados" value={String(entries.length)} />
          <StatTile label="Em dia" value={String(counts.ok)} />
          <StatTile label="Atenção" value={String(counts.atencao)} subLabel="rodou há 30–48h" />
          <StatTile label="Crítico" value={String(counts.critico)} subLabel="rodou há mais de 48h, ou nunca" />
        </div>

        <div className="card">
          <p className="card-title">Pipelines</p>
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Horário programado (UTC)</th>
                <th>Última execução</th>
                <th>Há quanto tempo</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.blobName}>
                  <td>{e.name}</td>
                  <td>{e.scheduleUtc}</td>
                  <td>{formatDateTime(e.generatedAt)}</td>
                  <td>{formatAge(e.hoursSinceGenerated)}</td>
                  <td>
                    <span className="status-pill">
                      <span className="status-dot" style={{ background: STATUS_COLOR[e.status] }} />
                      {STATUS_LABEL[e.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12 }}>
            "Resumo consolidado de custos" reflete a cadeia inteira de ingestão (disparo diário dos exports de
            custo → ingestão dos CSVs → reconstrução do resumo) — se ela estiver crítica, o problema provavelmente
            está mais cedo nessa cadeia, não no passo final em si. Status: em dia (até 30h), atenção (30–48h),
            crítico (mais de 48h ou nunca rodou).
          </p>
        </div>
      </QueryState>
    </>
  );
}
