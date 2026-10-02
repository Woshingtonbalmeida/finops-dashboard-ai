import { useMemo, useState } from "react";
import { useSummary } from "../hooks/useSummary";
import { useMonthlyHistory } from "../hooks/useMonthlyHistory";
import { useTagsByMonth } from "../hooks/useTagsByMonth";
import { RankedBarChart } from "../components/RankedBarChart";
import { QueryState } from "../components/QueryState";
import { formatCurrency } from "../lib/format";
import { downloadCsv, toCsv } from "../lib/csvExport";

// Preferred order when present — these match the org's tag governance policy.
const PREFERRED_KEYS = ["PRODUTO", "CLIENTE", "ENV", "OWNER"];

function monthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number);
  const label = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function ByTags() {
  const { data: summary, isLoading: summaryLoading, error: summaryError } = useSummary();
  const { data: monthlyHistory } = useMonthlyHistory();

  // Same months already offered elsewhere in the app (Resumo executivo) — Cost
  // Management's Query API keeps ~13 months, independent of the FOCUS export's own
  // start date.
  const availableMonths = useMemo(() => [...new Set((monthlyHistory?.entries ?? []).map((e) => e.yearMonth))].sort(), [monthlyHistory]);
  const latestMonth = availableMonths[availableMonths.length - 1];
  const [selectedMonth, setSelectedMonth] = useState<string | undefined>(undefined);
  const activeMonth = selectedMonth && availableMonths.includes(selectedMonth) ? selectedMonth : latestMonth;
  const isCurrentMonth = !!activeMonth && activeMonth === latestMonth;

  // Current month reuses the already-loaded summary (instant) — past months are computed
  // on demand from that month's raw FOCUS export, which takes a few seconds since nothing
  // keeps a persisted history for this dimension.
  const monthQuery = useTagsByMonth(activeMonth ?? "", !isCurrentMonth);
  const data = isCurrentMonth
    ? summary && { byTag: summary.byTag, taggedResources: summary.taggedResources, currency: summary.currency }
    : monthQuery.data;
  const isLoading = isCurrentMonth ? summaryLoading : monthQuery.isLoading;
  const error = isCurrentMonth ? summaryError : monthQuery.error;

  const [tagKey, setTagKey] = useState<string | undefined>(undefined);
  const [tagValue, setTagValue] = useState<string>("");

  const tagKeys = useMemo(() => {
    if (!data) return [];
    const keys = [...new Set(data.byTag.map((t) => t.tagKey))];
    keys.sort((a, b) => {
      const ai = PREFERRED_KEYS.indexOf(a);
      const bi = PREFERRED_KEYS.indexOf(b);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      return a.localeCompare(b);
    });
    return keys;
  }, [data]);

  // Falls back to the first key when the previously-selected one doesn't exist in the
  // newly loaded month (e.g. switching months changes which tags even appear).
  const activeKey = tagKey && tagKeys.includes(tagKey) ? tagKey : tagKeys[0];
  const filtered = useMemo(() => {
    if (!data || !activeKey) return [];
    return data.byTag.filter((t) => t.tagKey === activeKey);
  }, [data, activeKey]);

  // Lista de valores desta tag pra popular o filtro "Valor" (ex.: escolher um cliente
  // específico dentro da tag CLIENTE) — ordenado alfabeticamente pra facilitar achar um nome.
  const valueOptions = useMemo(() => [...filtered].sort((a, b) => a.tagValue.localeCompare(b.tagValue)), [filtered]);

  // Se a tag mudou e o valor selecionado não existe mais nela, volta pra "Todos".
  const activeValue = tagValue && valueOptions.some((v) => v.tagValue === tagValue) ? tagValue : "";

  const displayed = useMemo(
    () => (activeValue ? filtered.filter((t) => t.tagValue === activeValue) : filtered),
    [filtered, activeValue],
  );

  const total = filtered.reduce((sum, t) => sum + t.cost, 0);

  // Todo recurso que tem essa tag aplicada, com o valor resolvido — pra auditar se a tag
  // foi aplicada no cliente/produto/etc certo, não só ver o total agregado. Um recurso
  // retagueado no meio do mês aparece uma vez por valor que teve, cada uma só com o custo
  // do período daquele valor — soma exatamente igual ao Detalhamento acima.
  const taggedResources = useMemo(() => {
    if (!data || !activeKey) return [];
    return data.taggedResources
      .filter((r) => r.tagKey === activeKey && (!activeValue || r.tagValue === activeValue))
      .sort((a, b) => (a.tagValue === b.tagValue ? b.cost - a.cost : a.tagValue.localeCompare(b.tagValue)));
  }, [data, activeKey, activeValue]);

  const handleExport = () => {
    if (!data || !activeKey) return;
    const csv = toCsv(
      [activeKey, "Recurso", "Resource Group", "Subscription", "Serviço", `Custo (${data.currency})`],
      taggedResources.map((r) => [r.tagValue, r.resourceName, r.resourceGroup, r.subscriptionName, r.service, r.cost]),
    );
    const suffix = activeValue ? `-${activeValue.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : "";
    downloadCsv(`custos-por-tag-${activeKey.toLowerCase()}-${activeMonth}${suffix}.csv`, csv);
  };

  return (
    <>
      <h1 className="page-title">Custos por tags</h1>
      <p className="page-subtitle">
        {isCurrentMonth || !activeMonth ? "Mês corrente" : `Mês selecionado (${monthLabel(activeMonth)})`}, agregado
        pelas tags dos recursos (coluna Tags do FOCUS export)
        {!isCurrentMonth && !!activeMonth && " — calculado na hora, pode levar alguns segundos"}
      </p>

      <QueryState isLoading={isLoading} error={error} hasData={!!data && tagKeys.length > 0}>
        {data && activeKey && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <select
                  value={activeMonth ?? ""}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  style={{
                    background: "var(--surface-1)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: "6px 10px",
                    fontSize: 13,
                  }}
                >
                  {availableMonths.map((m) => (
                    <option key={m} value={m}>
                      {monthLabel(m)}
                    </option>
                  ))}
                </select>
                <select
                  value={activeKey}
                  onChange={(e) => {
                    setTagKey(e.target.value);
                    setTagValue("");
                  }}
                  style={{
                    background: "var(--surface-1)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: "6px 10px",
                    fontSize: 13,
                  }}
                >
                  {tagKeys.map((key) => (
                    <option key={key} value={key}>
                      {key}
                    </option>
                  ))}
                </select>
                <select
                  value={activeValue}
                  onChange={(e) => setTagValue(e.target.value)}
                  style={{
                    background: "var(--surface-1)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: "6px 10px",
                    fontSize: 13,
                    minWidth: 180,
                  }}
                >
                  <option value="">Todos os valores de {activeKey}</option>
                  {valueOptions.map((v) => (
                    <option key={v.tagValue} value={v.tagValue}>
                      {v.tagValue}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleExport}
                disabled={taggedResources.length === 0}
                style={{
                  background: "transparent",
                  color: "var(--brand-accent)",
                  border: "1px solid var(--brand-accent)",
                  borderRadius: 6,
                  padding: "6px 12px",
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: taggedResources.length === 0 ? "default" : "pointer",
                  opacity: taggedResources.length === 0 ? 0.6 : 1,
                  whiteSpace: "nowrap",
                }}
              >
                Exportar CSV ({taggedResources.length} recurso{taggedResources.length === 1 ? "" : "s"})
              </button>
            </div>

            <div className="charts-grid">
              <div className="card">
                <p className="card-title">
                  {activeValue ? `"${activeKey}" = "${activeValue}"` : `Top 15 valores de "${activeKey}"`}
                </p>
                <RankedBarChart
                  data={displayed.map((t) => ({ name: t.tagValue, cost: t.cost }))}
                  currency={data.currency}
                  maxItems={15}
                />
              </div>
            </div>

            <div className="card">
              <p className="card-title">Detalhamento</p>
              <table className="table">
                <thead>
                  <tr>
                    <th>{activeKey}</th>
                    <th>Custo</th>
                    <th>% do total (nesta tag)</th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.map((t) => (
                    <tr key={t.tagValue}>
                      <td>{t.tagValue}</td>
                      <td>{formatCurrency(t.cost, data.currency)}</td>
                      <td>{total > 0 ? `${((t.cost / total) * 100).toFixed(1)}%` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12 }}>
                Um recurso sem a tag "{activeKey}" não aparece nesta lista. Recursos com múltiplas tags entram no
                cálculo de cada tag separadamente. O botão "Exportar CSV" acima traz um recurso por linha (não
                agregado), com o valor de "{activeKey}" de cada um — útil pra conferir se a tag foi aplicada no
                cliente/produto/etc. certo. Se a tag de um recurso mudou de valor durante o mês, ele aparece uma
                linha por valor que teve, cada uma só com o custo do período daquele valor — a soma bate exatamente
                com a tabela acima.
              </p>
            </div>
          </>
        )}
      </QueryState>
    </>
  );
}
