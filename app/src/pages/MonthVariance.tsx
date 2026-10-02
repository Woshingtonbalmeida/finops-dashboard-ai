import { useEffect, useMemo, useState } from "react";
import { useMonthVariance, useSaveMonthVarianceNote } from "../hooks/useMonthVariance";
import { QueryState } from "../components/QueryState";
import { StatTile } from "../components/StatTile";
import { formatCurrency, formatPercent } from "../lib/format";
import type { VarianceChangeType, VarianceDimension, VarianceRow } from "../types";

const DIMENSION_LABEL: Record<VarianceDimension, string> = {
  service: "Serviço",
  resourceGroup: "Grupo de recursos",
};

const CHANGE_COLOR: Record<VarianceChangeType, string> = {
  Sumiu: "var(--status-good)",
  Reduziu: "var(--status-good)",
  Surgiu: "var(--status-critical)",
  Aumentou: "var(--status-warning)",
  Estável: "var(--text-muted)",
};

// How many rows each table shows before the "ver todas" toggle — enough to cover the lines
// that actually explain a month's variance without turning the page into a 200-row dump.
const TOP_N = 15;

function monthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number);
  const label = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("pt-BR", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR", { dateStyle: "short" });
}

interface NoteCellProps {
  row: VarianceRow;
  dimension: VarianceDimension;
  fromMonth: string;
  toMonth: string;
}

function NoteCell({ row, dimension, fromMonth, toMonth }: NoteCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.note?.note ?? "");
  const save = useSaveMonthVarianceNote();

  if (!editing) {
    return (
      <div>
        {row.note ? (
          <>
            <span>{row.note.note}</span>
            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "4px 0 0" }}>
              {row.note.updatedBy ? `${row.note.updatedBy} · ` : ""}
              {formatDate(row.note.updatedAt)}
            </p>
          </>
        ) : (
          <span style={{ color: "var(--text-muted)" }}>—</span>
        )}
        <button
          onClick={() => {
            setDraft(row.note?.note ?? "");
            setEditing(true);
          }}
          style={{
            display: "block",
            marginTop: 4,
            background: "transparent",
            border: "none",
            padding: 0,
            color: "var(--brand-accent)",
            fontSize: 11.5,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {row.note ? "Editar" : "Anotar"}
        </button>
      </div>
    );
  }

  return (
    <div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={3}
        autoFocus
        placeholder="O que foi feito? Ex.: SQL desligado após encerramento do projeto X."
        style={{
          width: "100%",
          minWidth: 220,
          background: "var(--surface-raised, transparent)",
          color: "inherit",
          border: "1px solid var(--border-subtle, #555)",
          borderRadius: 6,
          padding: 8,
          fontSize: 12.5,
          fontFamily: "inherit",
          resize: "vertical",
        }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <button
          onClick={() =>
            save.mutate(
              { dimension, key: row.key, subscriptionId: row.subscriptionId, fromMonth, toMonth, note: draft },
              { onSuccess: () => setEditing(false) }
            )
          }
          disabled={save.isPending}
          style={{
            background: "var(--brand-accent)",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            padding: "5px 12px",
            fontSize: 12,
            fontWeight: 600,
            cursor: save.isPending ? "default" : "pointer",
            opacity: save.isPending ? 0.6 : 1,
          }}
        >
          {save.isPending ? "Salvando…" : "Salvar"}
        </button>
        <button
          onClick={() => setEditing(false)}
          style={{
            background: "transparent",
            color: "var(--text-muted)",
            border: "1px solid var(--border-subtle, #555)",
            borderRadius: 6,
            padding: "5px 12px",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Cancelar
        </button>
      </div>
      {save.error && (
        <p style={{ fontSize: 11.5, color: "var(--status-critical)", margin: "6px 0 0" }}>
          {(save.error as Error).message}
        </p>
      )}
    </div>
  );
}

interface VarianceTableProps {
  title: string;
  description: string;
  rows: VarianceRow[];
  currency: string;
  dimension: VarianceDimension;
  fromMonth: string;
  toMonth: string;
}

function VarianceTable({ title, description, rows, currency, dimension, fromMonth, toMonth }: VarianceTableProps) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? rows : rows.slice(0, TOP_N);

  return (
    <div className="card">
      <p className="card-title">{title}</p>
      <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "0 0 12px" }}>{description}</p>
      {rows.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Nenhuma variação relevante neste período.</p>
      ) : (
        <>
          <table className="table table-spacious">
            <thead>
              <tr>
                <th>{DIMENSION_LABEL[dimension]}</th>
                <th>Assinatura</th>
                <th style={{ textAlign: "right" }}>{monthLabel(fromMonth)}</th>
                <th style={{ textAlign: "right" }}>{monthLabel(toMonth)}</th>
                <th style={{ textAlign: "right" }}>Diferença</th>
                <th>Tipo</th>
                <th style={{ minWidth: 240 }}>O que foi feito</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={`${row.key}|${row.subscriptionId}`}>
                  <td>{row.key}</td>
                  <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{row.subscriptionName}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{formatCurrency(row.fromCost, currency)}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{formatCurrency(row.toCost, currency)}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap", color: row.delta < 0 ? "var(--status-good)" : "var(--status-warning)" }}>
                    {formatCurrency(row.delta, currency)}
                    {row.deltaPercent !== null && (
                      <span style={{ display: "block", fontSize: 11.5, color: "var(--text-muted)" }}>
                        {formatPercent(row.deltaPercent)}
                      </span>
                    )}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <span className="status-pill">
                      <span className="status-dot" style={{ background: CHANGE_COLOR[row.changeType] }} />
                      {row.changeType}
                    </span>
                  </td>
                  <td>
                    <NoteCell row={row} dimension={dimension} fromMonth={fromMonth} toMonth={toMonth} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > TOP_N && (
            <button
              onClick={() => setShowAll(!showAll)}
              style={{
                marginTop: 12,
                background: "transparent",
                border: "none",
                padding: 0,
                color: "var(--brand-accent)",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {showAll ? "Mostrar menos" : `Ver todas (${rows.length})`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

export function MonthVariance() {
  const [dimension, setDimension] = useState<VarianceDimension>("service");
  const [fromMonth, setFromMonth] = useState<string>();
  const [toMonth, setToMonth] = useState<string>();
  const { data, isLoading, error } = useMonthVariance(dimension, fromMonth, toMonth);

  // The server picks the opening month pair, but the selects have to be driven by local
  // state from then on: binding them straight to data.fromMonth/toMonth made a second
  // change land while the first response was still in flight and get overwritten by the
  // older value coming back.
  useEffect(() => {
    if (!data) return;
    setFromMonth((current) => current ?? data.fromMonth);
    setToMonth((current) => current ?? data.toMonth);
  }, [data]);

  const months = data?.availableMonths ?? [];
  const drops = useMemo(() => (data?.rows ?? []).filter((r) => r.delta < 0), [data]);
  const rises = useMemo(() => (data?.rows ?? []).filter((r) => r.delta > 0).reverse(), [data]);

  const selectStyle: React.CSSProperties = {
    background: "transparent",
    color: "inherit",
    border: "1px solid var(--border-subtle, #555)",
    borderRadius: 6,
    padding: "6px 10px",
    fontSize: 12.5,
  };

  return (
    <>
      <h1 className="page-title">Análise de variação</h1>
      <p className="page-subtitle">
        O que mudou entre dois meses e por quê — a diferença por serviço ou grupo de recursos, com espaço pra
        registrar o que foi feito. O histórico de mudanças do Azure só guarda 14 dias, então a anotação é o que
        preserva essa explicação a longo prazo.
      </p>

      <QueryState isLoading={isLoading} error={error} hasData={!!data}>
        {data && (
          <>
            <div className="card" style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end" }}>
              {months.length > 0 && (
                <>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--text-muted)" }}>
                    Mês base
                    <select value={fromMonth ?? data.fromMonth} onChange={(e) => setFromMonth(e.target.value)} style={selectStyle}>
                      {months.map((m) => (
                        <option key={m} value={m}>
                          {monthLabel(m)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--text-muted)" }}>
                    Comparar com
                    <select value={toMonth ?? data.toMonth} onChange={(e) => setToMonth(e.target.value)} style={selectStyle}>
                      {months.map((m) => (
                        <option key={m} value={m}>
                          {monthLabel(m)}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--text-muted)" }}>
                Agrupar por
                <select value={dimension} onChange={(e) => setDimension(e.target.value as VarianceDimension)} style={selectStyle}>
                  <option value="service">Serviço</option>
                  <option value="resourceGroup">Grupo de recursos</option>
                </select>
              </label>
            </div>

            {months.length === 0 && (
              <div className="card" style={{ borderLeft: "3px solid var(--status-warning)" }}>
                <p style={{ fontSize: 13, margin: 0 }}>
                  Ainda não há histórico mensal por {DIMENSION_LABEL[dimension].toLowerCase()}. Esse recorte passou
                  a ser coletado junto com esta página, então ele só aparece depois do próximo refresh diário do
                  histórico mensal (06:20 UTC). Pra não esperar, use "Atualizar agora" no comparativo mensal do
                  Resumo executivo.
                </p>
              </div>
            )}

            {months.length > 0 && [data.fromMonth, data.toMonth].includes(new Date().toISOString().slice(0, 7)) && (
              <div className="card" style={{ borderLeft: "3px solid var(--status-warning)" }}>
                <p style={{ fontSize: 13, margin: 0 }}>
                  O mês corrente ainda está aberto — só tem os dias já faturados. Comparado com um mês fechado ele
                  sempre parece menor, então essa seleção não serve pra concluir que o custo caiu.
                </p>
              </div>
            )}

            {months.length > 0 && (
              <>
                <div className="kpi-grid">
                  <StatTile label={monthLabel(data.fromMonth)} value={formatCurrency(data.fromTotal, data.currency)} />
                  <StatTile label={monthLabel(data.toMonth)} value={formatCurrency(data.toTotal, data.currency)} />
                  <StatTile
                    label="Diferença"
                    value={formatCurrency(data.delta, data.currency)}
                    deltaLabel={data.deltaPercent !== null ? `${formatPercent(data.deltaPercent)} vs. ${monthLabel(data.fromMonth)}` : undefined}
                    deltaDirection={data.delta > 0 ? "up-bad" : "down-good"}
                  />
                  <StatTile label="Linhas com variação" value={String(data.rows.length)} subLabel="diferença acima de R$ 1,00" />
                </div>

                <VarianceTable
                  title="Maiores quedas"
                  description="Onde o custo caiu. Confirme na coluna de anotação o que causou cada queda — é o que evita repetir a investigação no mês que vem."
                  rows={drops}
                  currency={data.currency}
                  dimension={dimension}
                  fromMonth={data.fromMonth}
                  toMonth={data.toMonth}
                />

                <VarianceTable
                  title="Maiores altas"
                  description="Onde o custo subiu. 'Surgiu' significa que praticamente não havia custo no mês base."
                  rows={rises}
                  currency={data.currency}
                  dimension={dimension}
                  fromMonth={data.fromMonth}
                  toMonth={data.toMonth}
                />

                <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  Valores vindos da API de custo do Azure (mesma fonte do comparativo mensal), custo real por mês
                  fechado. "Sumiu" e "Surgiu" marcam os casos em que um dos lados ficou abaixo de 2% do outro — típico
                  de recurso excluído ou criado, e não de redimensionamento.
                </p>
              </>
            )}
          </>
        )}
      </QueryState>
    </>
  );
}
