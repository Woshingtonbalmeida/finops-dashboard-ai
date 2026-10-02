import { useSummary } from "../hooks/useSummary";
import { useForecast } from "../hooks/useForecast";
import { RankedBarChart } from "../components/RankedBarChart";
import { QueryState } from "../components/QueryState";
import { formatCurrency, formatPercent } from "../lib/format";

export function BySubscription() {
  const { data, isLoading, error } = useSummary();
  const { data: forecastData } = useForecast();
  const total = data?.bySubscription.reduce((sum, s) => sum + s.cost, 0) ?? 0;

  return (
    <>
      <h1 className="page-title">Custos por assinatura</h1>
      <p className="page-subtitle">Mês corrente, custo efetivo (amortizado)</p>

      <QueryState isLoading={isLoading} error={error} hasData={!!data && data.bySubscription.length > 0}>
        {data && (
          <>
            <div className="charts-grid">
              <div className="card">
                <p className="card-title">Ranking de subscriptions</p>
                <RankedBarChart
                  data={data.bySubscription.map((s) => ({ name: s.subscriptionName, cost: s.cost }))}
                  currency={data.currency}
                />
              </div>
            </div>

            <div className="card">
              <p className="card-title">Detalhamento</p>
              <table className="table">
                <thead>
                  <tr>
                    <th>Subscription</th>
                    <th>Actual cost</th>
                    <th>Forecast</th>
                    <th>% do total (Actual cost)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bySubscription.map((s) => {
                    const forecast = forecastData?.bySubscription.find((f) => f.subscriptionId === s.subscriptionId);
                    return (
                      <tr key={s.subscriptionId}>
                        <td>{s.subscriptionName}</td>
                        <td>{formatCurrency(s.cost, data.currency)}</td>
                        <td>
                          {forecast ? formatCurrency(forecast.forecastAmount, forecast.currency) : "—"}
                        </td>
                        <td>{total > 0 ? formatPercent((s.cost / total) * 100).replace("+", "") : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12 }}>
                Forecast projeta o custo total do mês (dias já fechados + estimativa dos dias restantes), igual ao
                Cost Management do portal Azure. "% do total" é a participação de cada subscription no Actual cost
                somado das duas — não considera o Forecast.
              </p>
            </div>
          </>
        )}
      </QueryState>
    </>
  );
}
