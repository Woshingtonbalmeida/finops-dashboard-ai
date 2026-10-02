import { subscriptionsLabel } from "../config/brand";
import { useMemo, useState } from "react";
import { useSummary } from "../hooks/useSummary";
import { useForecast, useRefreshForecast } from "../hooks/useForecast";
import { useMonthlyHistory, useRefreshMonthlyHistory } from "../hooks/useMonthlyHistory";
import { useOptimization } from "../hooks/useOptimization";
import { useOrphanedResources } from "../hooks/useOrphanedResources";
import { StatTile } from "../components/StatTile";
import { TrendChart } from "../components/TrendChart";
import { MonthlySubscriptionChart } from "../components/MonthlySubscriptionChart";
import { SubscriptionTrendChart } from "../components/SubscriptionTrendChart";
import { ServiceMonthlyTable } from "../components/ServiceMonthlyTable";
import { ServiceCostDonut } from "../components/ServiceCostDonut";
import { RankedBarChart } from "../components/RankedBarChart";
import { QueryState } from "../components/QueryState";
import { PrintButton } from "../components/PrintButton";
import { TrendUpIcon } from "../components/Icons";
import { formatCurrency, formatPercent } from "../lib/format";
import { INGRAM_CONSUMPTION_MARGIN, INGRAM_RI_MARGIN, marginPercentLabel, withIngramMargin } from "../lib/ingramMargin";

function monthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number);
  const label = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("pt-BR", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const compareSelectStyle: React.CSSProperties = {
  background: "var(--surface-1)",
  color: "var(--text-primary)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "5px 8px",
  fontSize: 12.5,
};

export function ExecutiveSummary() {
  const { data: summary, isLoading, error } = useSummary();
  const { data: forecast } = useForecast();
  const refreshForecast = useRefreshForecast();
  const { data: monthlyHistory } = useMonthlyHistory();
  const refreshMonthlyHistory = useRefreshMonthlyHistory();
  const { data: optimization } = useOptimization();
  const { data: orphaned } = useOrphanedResources();

  // Since January, independent of the FOCUS export (which only has raw data since the
  // exports were created) — Cost Management's own Query API keeps ~13 months of history.
  const availableMonths = useMemo(
    () => [...new Set((monthlyHistory?.entries ?? []).map((e) => e.yearMonth))].sort(),
    [monthlyHistory],
  );
  const [monthA, setMonthA] = useState<string | undefined>(undefined);
  const [monthB, setMonthB] = useState<string | undefined>(undefined);
  const selectedA = monthA ?? availableMonths[availableMonths.length - 2] ?? availableMonths[0];
  const selectedB = monthB ?? availableMonths[availableMonths.length - 1];
  const compareData = useMemo(
    () => (monthlyHistory?.entries ?? []).filter((e) => e.yearMonth === selectedA || e.yearMonth === selectedB),
    [monthlyHistory, selectedA, selectedB],
  );
  const compareCurrency = monthlyHistory?.entries[0]?.currency ?? "BRL";

  const [monthlyChartView, setMonthlyChartView] = useState<"compare" | "accumulated" | "daily">("compare");
  // Anchored to the latest date the backend actually has (not the browser's clock) — trend
  // is a rolling 60-day window, not calendar-bound, so this picks out just the current month.
  const currentTrendMonth = summary?.trend[summary.trend.length - 1]?.date.slice(0, 7);
  const currentMonthTrend = useMemo(
    () => (summary?.trend ?? []).filter((t) => t.date.startsWith(currentTrendMonth ?? "\0")),
    [summary, currentTrendMonth],
  );

  const [serviceTableSub, setServiceTableSub] = useState<string>("all");
  const serviceTableData = useMemo(
    () =>
      serviceTableSub === "all"
        ? (monthlyHistory?.byService ?? [])
        : (monthlyHistory?.byService ?? []).filter((e) => e.subscriptionId === serviceTableSub),
    [monthlyHistory, serviceTableSub],
  );
  const latestServiceMonth = availableMonths[availableMonths.length - 1];
  const [donutMonthFrom, setDonutMonthFrom] = useState<string | undefined>(undefined);
  const [donutMonthTo, setDonutMonthTo] = useState<string | undefined>(undefined);
  const activeDonutFrom = donutMonthFrom && availableMonths.includes(donutMonthFrom) ? donutMonthFrom : latestServiceMonth;
  const activeDonutTo = donutMonthTo && availableMonths.includes(donutMonthTo) ? donutMonthTo : latestServiceMonth;
  // Dropdowns are independent — if the user picks them in the "wrong" order, sort instead
  // of showing an empty/confusing range.
  const [donutRangeStart, donutRangeEnd] = activeDonutFrom <= activeDonutTo ? [activeDonutFrom, activeDonutTo] : [activeDonutTo, activeDonutFrom];
  const [donutService, setDonutService] = useState<string>("");

  const serviceOptions = useMemo(() => [...new Set(serviceTableData.map((r) => r.service))].sort(), [serviceTableData]);
  const activeDonutService = donutService && serviceOptions.includes(donutService) ? donutService : "";

  const donutByService = useMemo(() => {
    const byService = new Map<string, number>();
    for (const row of serviceTableData) {
      if (row.yearMonth < donutRangeStart || row.yearMonth > donutRangeEnd) continue;
      byService.set(row.service, (byService.get(row.service) ?? 0) + row.cost);
    }
    return [...byService.entries()].map(([service, cost]) => ({ service, cost }));
  }, [serviceTableData, donutRangeStart, donutRangeEnd]);

  // A serviço selecionado só filtra a tabela (que já lista todos os meses em colunas) — a
  // pizza continua mostrando a distribuição inteira do mês, só destacando essa fatia.
  const serviceTableRows = activeDonutService ? serviceTableData.filter((r) => r.service === activeDonutService) : serviceTableData;

  const totalForecast = forecast?.bySubscription.reduce((sum, f) => sum + f.forecastAmount, 0) ?? 0;
  const forecastCurrency = forecast?.bySubscription[0]?.currency ?? "BRL";

  const variance =
    summary && summary.totalPriorMonthCostToDate > 0
      ? ((summary.totalMtdCost - summary.totalPriorMonthCostToDate) / summary.totalPriorMonthCostToDate) * 100
      : undefined;

  // Same filter as the Advisor page: only count recommendations with quantified savings.
  const advisorRecs = (optimization?.advisorRecommendations ?? []).filter((r) => r.totalAnnualSavingsBilling > 0);
  const totalAdvisorSavings = advisorRecs.reduce((sum, r) => sum + r.totalAnnualSavingsBilling, 0);
  const advisorCurrency = advisorRecs[0]?.billingCurrency ?? "BRL";
  const topRecs = [...advisorRecs].sort((a, b) => b.totalAnnualSavingsBilling - a.totalAnnualSavingsBilling).slice(0, 3);

  const reservationCommitment =
    optimization?.reservations.reduce((sum, r) => sum + (r.monthlyAmountBilling ?? 0), 0) ?? 0;
  const reservationCurrency = optimization?.reservations[0]?.billingCurrency ?? "BRL";

  // RI já comprometido leva a margem de RI (18%), o resto do forecast leva a margem de
  // consumo (7%) — mais preciso que aplicar um percentual só sobre o total, já que as duas
  // fatias têm margens diferentes na fatura.
  const reservationCommitmentWithMargin = withIngramMargin(reservationCommitment, INGRAM_RI_MARGIN);
  const forecastEstimatedInvoice =
    withIngramMargin(Math.max(totalForecast - reservationCommitment, 0), INGRAM_CONSUMPTION_MARGIN) +
    reservationCommitmentWithMargin;
  // % calculada na mesma base do valor exibido (fatura estimada, não custo Azure puro) —
  // senão numerador e denominador ficariam em bases diferentes.
  const reservationShareOfForecast =
    forecastEstimatedInvoice > 0 ? (reservationCommitmentWithMargin / forecastEstimatedInvoice) * 100 : undefined;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div>
          <h1 className="page-title">Resumo executivo</h1>
          <p className="page-subtitle">Panorama consolidado de custo e oportunidades de otimização — {subscriptionsLabel()}</p>
        </div>
        <PrintButton />
      </div>

      <QueryState isLoading={isLoading} error={error} hasData={!!summary}>
        {summary && (
          <>
            <div className="exec-hero">
              <div className="card hero-tile">
                <p className="stat-tile-label">Gasto no mês (Actual cost)</p>
                <p className="stat-tile-value">{formatCurrency(summary.totalMtdCost, summary.currency)}</p>
                {variance !== undefined && (
                  <p className={`stat-tile-delta ${variance > 0 ? "delta-up-bad" : "delta-down-good"}`}>
                    {formatPercent(variance)} vs. mês anterior
                  </p>
                )}
                <p className="stat-tile-delta" style={{ color: "var(--text-muted)" }}>
                  Valor estimado da fatura:{" "}
                  {formatCurrency(withIngramMargin(summary.totalMtdCost, INGRAM_CONSUMPTION_MARGIN), summary.currency)} (Azure +{" "}
                  {marginPercentLabel(INGRAM_CONSUMPTION_MARGIN)} de margem)
                </p>
                <div style={{ marginTop: 16 }}>
                  <TrendChart data={summary.trend} currency={summary.currency} />
                </div>
              </div>

              <div className="card hero-tile hero-tile-accent">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <p className="stat-tile-label">
                    <TrendUpIcon />
                    Forecast do mês
                  </p>
                  <button
                    onClick={() => refreshForecast.mutate()}
                    disabled={refreshForecast.isPending}
                    style={{
                      background: "transparent",
                      color: "var(--brand-accent)",
                      border: "1px solid var(--brand-accent)",
                      borderRadius: 6,
                      padding: "3px 10px",
                      fontSize: 11.5,
                      cursor: refreshForecast.isPending ? "default" : "pointer",
                      opacity: refreshForecast.isPending ? 0.6 : 1,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {refreshForecast.isPending ? "Atualizando…" : "Atualizar agora"}
                  </button>
                </div>
                <p className="stat-tile-value">{formatCurrency(totalForecast, forecastCurrency)}</p>
                <p className="stat-tile-delta" style={{ color: "var(--text-muted)" }}>
                  Projeção Azure: dias fechados + estimativa dos dias restantes
                </p>
                {reservationShareOfForecast !== undefined && (
                  <p className="stat-tile-delta" style={{ color: "var(--text-muted)" }}>
                    {formatCurrency(reservationCommitmentWithMargin, reservationCurrency)} ({reservationShareOfForecast.toFixed(1)}%)
                    já comprometido via Reserved Instances (valor com margem)
                  </p>
                )}
                <p className="stat-tile-delta" style={{ color: "var(--text-muted)" }}>
                  Valor estimado da fatura (consumo + RI): {formatCurrency(forecastEstimatedInvoice, forecastCurrency)} — consumo
                  Azure +{marginPercentLabel(INGRAM_CONSUMPTION_MARGIN)}, Reserved Instances +{marginPercentLabel(INGRAM_RI_MARGIN)}
                </p>
                {refreshForecast.isError && (
                  <p style={{ fontSize: 11.5, color: "var(--status-critical)", marginTop: 4 }}>
                    Não foi possível atualizar agora. Tente novamente em instantes.
                  </p>
                )}
                <div style={{ marginTop: 18 }}>
                  <RankedBarChart
                    data={summary.bySubscription.map((s) => ({ name: s.subscriptionName, cost: s.cost }))}
                    currency={summary.currency}
                  />
                </div>
              </div>
            </div>

            <div className="kpi-grid">
              <StatTile
                label="Economia potencial identificada"
                value={formatCurrency(totalAdvisorSavings, advisorCurrency)}
                deltaLabel={`${advisorRecs.length} recomendação(ões) do Advisor`}
              />
              <StatTile
                label="Desperdício em recursos órfãos"
                value={formatCurrency(orphaned?.totalMtdCost ?? 0, orphaned?.currency ?? "BRL")}
                deltaLabel={`${orphaned?.resources.length ?? 0} recurso(s) sem uso`}
              />
              <StatTile
                label="Comprometido em Reserved Instances"
                value={formatCurrency(reservationCommitment, reservationCurrency)}
                deltaLabel="por mês, recorrente"
                subLabel={`Valor estimado da fatura: ${formatCurrency(reservationCommitmentWithMargin, reservationCurrency)} (RI + ${marginPercentLabel(INGRAM_RI_MARGIN)} de margem)`}
              />
              <StatTile label="Subscriptions monitoradas" value={String(summary.bySubscription.length)} />
            </div>

            <div className="card" style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
                <p className="card-title" style={{ margin: 0 }}>
                  {monthlyChartView === "compare"
                    ? "Comparativo de consumo mensal por subscription"
                    : monthlyChartView === "accumulated"
                      ? "Acumulado no mês por subscription"
                      : "Custo diário por subscription"}
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
                    {(["compare", "accumulated", "daily"] as const).map((view) => (
                      <button
                        key={view}
                        onClick={() => setMonthlyChartView(view)}
                        style={{
                          background: monthlyChartView === view ? "var(--brand-accent)" : "transparent",
                          color: monthlyChartView === view ? "var(--surface-1)" : "var(--text-secondary)",
                          border: "none",
                          padding: "5px 10px",
                          fontSize: 11.5,
                          fontWeight: 600,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {view === "compare" ? "Comparativo mensal" : view === "accumulated" ? "Acumulado no mês" : "Diário"}
                      </button>
                    ))}
                  </div>
                  {monthlyChartView === "compare" && (
                    <>
                      <select value={selectedA ?? ""} onChange={(e) => setMonthA(e.target.value)} style={compareSelectStyle}>
                        {availableMonths.map((m) => (
                          <option key={m} value={m}>
                            {monthLabel(m)}
                          </option>
                        ))}
                      </select>
                      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>vs.</span>
                      <select value={selectedB ?? ""} onChange={(e) => setMonthB(e.target.value)} style={compareSelectStyle}>
                        {availableMonths.map((m) => (
                          <option key={m} value={m}>
                            {monthLabel(m)}
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                  {monthlyChartView === "compare" && (
                    <button
                      onClick={() => refreshMonthlyHistory.mutate()}
                      disabled={refreshMonthlyHistory.isPending}
                      style={{
                        background: "transparent",
                        color: "var(--brand-accent)",
                        border: "1px solid var(--brand-accent)",
                        borderRadius: 6,
                        padding: "5px 10px",
                        fontSize: 11.5,
                        cursor: refreshMonthlyHistory.isPending ? "default" : "pointer",
                        opacity: refreshMonthlyHistory.isPending ? 0.6 : 1,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {refreshMonthlyHistory.isPending ? "Atualizando…" : "Atualizar agora"}
                    </button>
                  )}
                </div>
              </div>
              {monthlyChartView === "compare" ? (
                availableMonths.length === 0 ? (
                  <p className="state-message">Ainda não há histórico mensal disponível.</p>
                ) : (
                  <MonthlySubscriptionChart data={compareData} currency={compareCurrency} />
                )
              ) : (
                <SubscriptionTrendChart data={currentMonthTrend} currency={summary.currency} mode={monthlyChartView} />
              )}
              {monthlyChartView === "compare" && refreshMonthlyHistory.isError && (
                <p style={{ fontSize: 11.5, color: "var(--status-critical)", marginTop: 8 }}>
                  Não foi possível atualizar agora. Tente novamente em instantes.
                </p>
              )}
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12 }}>
                {monthlyChartView === "compare" &&
                  "Desde janeiro deste ano, direto da API de custo do Azure — independente do export FOCUS usado no resto do dashboard, que só tem dado a partir de quando o export foi configurado."}
                {monthlyChartView === "accumulated" &&
                  'Soma acumulada dia a dia do mês corrente, por subscription — a altura total da coluna em qualquer dia é o gasto acumulado até ali, igual ao "Gasto no mês" no topo da página.'}
                {monthlyChartView === "daily" && "Custo de cada dia isolado (não acumulado) do mês corrente, empilhado por subscription."}
              </p>
            </div>

            <div className="card" style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
                <p className="card-title" style={{ margin: 0 }}>
                  Custo mensal por serviço (Top 15)
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <select value={activeDonutFrom} onChange={(e) => setDonutMonthFrom(e.target.value)} style={compareSelectStyle}>
                    {availableMonths.map((m) => (
                      <option key={m} value={m}>
                        {monthLabel(m)}
                      </option>
                    ))}
                  </select>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>até</span>
                  <select value={activeDonutTo} onChange={(e) => setDonutMonthTo(e.target.value)} style={compareSelectStyle}>
                    {availableMonths.map((m) => (
                      <option key={m} value={m}>
                        {monthLabel(m)}
                      </option>
                    ))}
                  </select>
                  <select value={activeDonutService} onChange={(e) => setDonutService(e.target.value)} style={compareSelectStyle}>
                    <option value="">Todos os serviços</option>
                    {serviceOptions.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <select value={serviceTableSub} onChange={(e) => setServiceTableSub(e.target.value)} style={compareSelectStyle}>
                    <option value="all">Todas as subscriptions</option>
                    {summary.bySubscription.map((s) => (
                      <option key={s.subscriptionId} value={s.subscriptionId}>
                        {s.subscriptionName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {serviceTableData.length === 0 ? (
                <p className="state-message">Ainda não há histórico mensal por serviço disponível.</p>
              ) : (
                <>
                  <p style={{ fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 4 }}>
                    Distribuição de{" "}
                    {donutRangeStart === donutRangeEnd
                      ? monthLabel(donutRangeStart)
                      : `${monthLabel(donutRangeStart)} a ${monthLabel(donutRangeEnd)}`}{" "}
                    por serviço
                  </p>
                  <ServiceCostDonut data={donutByService} currency={compareCurrency} highlightService={activeDonutService || undefined} />
                  <div style={{ marginTop: 18 }}>
                    <ServiceMonthlyTable data={serviceTableRows} currency={compareCurrency} maxItems={15} />
                  </div>
                </>
              )}
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12 }}>
                Top 15 serviços por custo total, mês a mês desde janeiro — mesma fonte de dados da pizza acima. A
                pizza soma o intervalo de meses selecionado, agrupando do 7º serviço em diante como "Outros";
                escolher um serviço destaca a fatia dele na pizza e filtra a tabela pra só aquela linha.
                {serviceTableSub === "all" && " Somando as duas subscriptions."}
              </p>
            </div>

            <div className="card">
              <p className="card-title">Top 3 oportunidades de economia</p>
              {topRecs.length === 0 ? (
                <p className="state-message">Nenhuma recomendação com economia quantificada no momento.</p>
              ) : (
                topRecs.map((r) => (
                  <div className="exec-opportunity-row" key={r.recommendationTypeId}>
                    <div>
                      <div className="exec-opportunity-label">{r.problem}</div>
                      <div className="exec-opportunity-meta">
                        {r.subCategory} · {r.affectedResourceCount} recurso(s)
                      </div>
                    </div>
                    <div className="exec-opportunity-value">
                      {formatCurrency(r.totalAnnualSavingsBilling, r.billingCurrency)}/ano
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </QueryState>
    </>
  );
}
