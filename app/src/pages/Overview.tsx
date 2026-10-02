import { subscriptionsLabel } from "../config/brand";
import { useMemo, useState } from "react";
import { useSummary } from "../hooks/useSummary";
import { useMonthlyHistory } from "../hooks/useMonthlyHistory";
import { useDailyCostByMonth } from "../hooks/useDailyCostByMonth";
import { StatTile } from "../components/StatTile";
import { TrendChart } from "../components/TrendChart";
import { SubscriptionTrendChart } from "../components/SubscriptionTrendChart";
import { RankedBarChart } from "../components/RankedBarChart";
import { QueryState } from "../components/QueryState";
import { formatCurrency, formatPercent } from "../lib/format";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function monthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number);
  const label = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function Overview() {
  const { data, isLoading, error, refetch, isFetching } = useSummary();
  const { data: monthlyHistory } = useMonthlyHistory();

  // Combined (both subscriptions summed) total per month, last 3 months available —
  // same source as the "Comparativo de consumo mensal" chart on Resumo executivo, just
  // collapsed across subscriptions instead of kept as separate series.
  const last3Months = useMemo(() => {
    const byMonth = new Map<string, { cost: number; currency: string }>();
    for (const e of monthlyHistory?.entries ?? []) {
      const m = byMonth.get(e.yearMonth) ?? { cost: 0, currency: e.currency };
      m.cost += e.cost;
      byMonth.set(e.yearMonth, m);
    }
    return [...byMonth.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .slice(-3)
      .map(([yearMonth, v]) => ({ yearMonth, ...v }));
  }, [monthlyHistory]);

  const latestMonth = last3Months[last3Months.length - 1]?.yearMonth;
  const [selectedMonth, setSelectedMonth] = useState<string | undefined>(undefined);
  const activeMonth = selectedMonth && last3Months.some((m) => m.yearMonth === selectedMonth) ? selectedMonth : latestMonth;
  const isCurrentMonth = !!activeMonth && activeMonth === latestMonth;

  // Anchored to the latest date the backend actually has (not the browser's clock) — trend
  // is a rolling 60-day window, not calendar-bound, so this picks out just the current
  // month's slice of it.
  const currentTrendMonth = data?.trend[data.trend.length - 1]?.date.slice(0, 7);
  const currentMonthTrend = useMemo(
    () => (data?.trend ?? []).filter((t) => t.date.startsWith(currentTrendMonth ?? "\0")),
    [data, currentTrendMonth],
  );

  // Clicking Jul/Ago instead of the current month needs day-level data outside the 60-day
  // trend window — computed on demand from that month's raw FOCUS export (same approach as
  // the month picker on Custos por tags), since nothing keeps a persisted daily history.
  const dailyMonthQuery = useDailyCostByMonth(activeMonth ?? "", !isCurrentMonth);
  const accumulatedTrend = isCurrentMonth ? currentMonthTrend : (dailyMonthQuery.data?.trend ?? []);
  const accumulatedCurrency = (isCurrentMonth ? data?.currency : dailyMonthQuery.data?.currency) ?? data?.currency ?? "BRL";

  // "Custo por subscription" / "Top serviços" for a past month come from the same
  // dailyMonthQuery pass as the accumulated chart above (not monthlyHistory, a different
  // Azure API) — otherwise the three cards for the same month wouldn't add up to the same
  // total, which reads as a bug even though both sources are individually correct.
  const bySubscriptionForMonth = useMemo(() => {
    if (isCurrentMonth) return (data?.bySubscription ?? []).map((s) => ({ name: s.subscriptionName, cost: s.cost }));
    return (dailyMonthQuery.data?.bySubscription ?? []).map((s) => ({ name: s.subscriptionName, cost: s.cost }));
  }, [isCurrentMonth, data, dailyMonthQuery.data]);

  const byServiceForMonth = useMemo(() => {
    if (isCurrentMonth) return (data?.byService ?? []).map((s) => ({ name: s.service, cost: s.cost }));
    return (dailyMonthQuery.data?.byService ?? []).map((s) => ({ name: s.service, cost: s.cost }));
  }, [isCurrentMonth, data, dailyMonthQuery.data]);

  const variance =
    data && data.totalPriorMonthCostToDate > 0
      ? ((data.totalMtdCost - data.totalPriorMonthCostToDate) / data.totalPriorMonthCostToDate) * 100
      : undefined;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div>
          <h1 className="page-title">Visão geral de custos</h1>
          <p className="page-subtitle">Custo consolidado — {subscriptionsLabel()}</p>
        </div>
        {data && (
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              style={{
                background: "transparent",
                color: "var(--brand-accent)",
                border: "1px solid var(--brand-accent)",
                borderRadius: 8,
                padding: "8px 14px",
                fontSize: 13,
                cursor: isFetching ? "default" : "pointer",
                opacity: isFetching ? 0.6 : 1,
                whiteSpace: "nowrap",
              }}
            >
              {isFetching ? "Atualizando…" : "Atualizar"}
            </button>
            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "6px 0 0" }}>
              Dados atualizados em: {formatDateTime(data.generatedAt)}
            </p>
          </div>
        )}
      </div>

      <QueryState isLoading={isLoading} error={error} hasData={!!data}>
        {data && (
          <>
            <div className="kpi-grid">
              <StatTile label="Gasto no mês (MTD)" value={formatCurrency(data.totalMtdCost, data.currency)} />
              <StatTile label="Mês anterior" value={formatCurrency(data.totalPriorMonthCost, data.currency)} />
              <StatTile
                label="Variação vs. mês anterior"
                value={variance !== undefined ? formatPercent(variance) : "—"}
                deltaLabel={variance !== undefined ? "comparado ao mesmo período do mês anterior" : undefined}
                deltaDirection={variance !== undefined ? (variance > 0 ? "up-bad" : "down-good") : "neutral"}
              />
              <StatTile label="Subscriptions monitoradas" value={String(data.bySubscription.length)} />
            </div>

            {last3Months.length > 0 && (
              <div className="card" style={{ marginBottom: 18 }}>
                <p className="card-title">Comparativo dos últimos 3 meses — {subscriptionsLabel()}, combinado</p>
                <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "-6px 0 12px" }}>
                  Clique em um mês para ver os gráficos abaixo daquele período. Estes 3 valores vêm direto da API de
                  custo do Azure (mesma fonte do "Comparativo de consumo mensal" no Resumo executivo); os gráficos
                  abaixo, para um mês passado, vêm do export FOCUS — as duas fontes costumam divergir uma fração.
                </p>
                <div className="kpi-grid">
                  {last3Months.map((m) => (
                    <button
                      key={m.yearMonth}
                      onClick={() => setSelectedMonth(m.yearMonth)}
                      style={{
                        all: "unset",
                        cursor: "pointer",
                        display: "block",
                        borderRadius: 10,
                        outline: m.yearMonth === activeMonth ? "2px solid var(--brand-accent)" : "2px solid transparent",
                        outlineOffset: 2,
                      }}
                    >
                      <StatTile label={monthLabel(m.yearMonth)} value={formatCurrency(m.cost, m.currency)} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="card" style={{ marginBottom: 18 }}>
              <p className="card-title">Acumulado no mês por subscription {!isCurrentMonth && `— ${monthLabel(activeMonth ?? "")}`}</p>
              {!isCurrentMonth && dailyMonthQuery.isLoading ? (
                <p className="state-message">Calculando {monthLabel(activeMonth ?? "")}, pode levar alguns segundos…</p>
              ) : (
                <SubscriptionTrendChart data={accumulatedTrend} currency={accumulatedCurrency} mode="accumulated" />
              )}
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12 }}>
                Soma acumulada dia a dia do mês selecionado, por subscription — a altura total da coluna em qualquer
                dia é o gasto acumulado até ali.
                {isCurrentMonth && ' Igual ao "Gasto no mês (MTD)" acima.'}
              </p>
            </div>

            <div className="charts-grid">
              <div className="card">
                <p className="card-title">Tendência de custo diário (últimos 60 dias)</p>
                <TrendChart data={data.trend} currency={data.currency} />
              </div>
            </div>

            <div className="two-col">
              <div className="card">
                <p className="card-title">Custo por subscription {isCurrentMonth ? "(mês atual)" : `(${monthLabel(activeMonth ?? "")})`}</p>
                <RankedBarChart data={bySubscriptionForMonth} currency={data.currency} />
              </div>
              <div className="card">
                <p className="card-title">Top serviços {isCurrentMonth ? "(mês atual)" : `(${monthLabel(activeMonth ?? "")})`}</p>
                <RankedBarChart data={byServiceForMonth} currency={data.currency} />
              </div>
            </div>
          </>
        )}
      </QueryState>
    </>
  );
}
