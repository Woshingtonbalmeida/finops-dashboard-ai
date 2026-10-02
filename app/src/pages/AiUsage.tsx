import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useSummary, useRefreshSummary } from "../hooks/useSummary";
import { StatTile } from "../components/StatTile";
import { RankedBarChart } from "../components/RankedBarChart";
import { QueryState } from "../components/QueryState";
import { formatCurrency, formatPercent, formatTokens } from "../lib/format";
import type { AiTokenType, AiUsageByModel, AiUsageMonth } from "../types";

const TOKEN_TYPE_LABEL: Record<AiTokenType, string> = {
  input: "Input",
  output: "Output",
  "cached-input": "Input (cache)",
  outro: "Outro",
};

function monthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number);
  const label = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("pt-BR", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function costPerMillionTokens(cost: number, tokens: number, currency: string): string {
  return tokens > 0 ? formatCurrency((cost / tokens) * 1_000_000, currency) : "—";
}

interface ModelTokenBreakdown {
  model: string;
  input: number;
  output: number;
  cachedInput: number;
  outro: number;
  totalTokens: number;
  totalCost: number;
}

function byModelBreakdown(byModel: AiUsageByModel[]): ModelTokenBreakdown[] {
  const byModelName = new Map<string, ModelTokenBreakdown>();
  for (const m of byModel) {
    const entry = byModelName.get(m.model) ?? {
      model: m.model,
      input: 0,
      output: 0,
      cachedInput: 0,
      outro: 0,
      totalTokens: 0,
      totalCost: 0,
    };
    if (m.tokenType === "input") entry.input += m.tokens;
    else if (m.tokenType === "output") entry.output += m.tokens;
    else if (m.tokenType === "cached-input") entry.cachedInput += m.tokens;
    else entry.outro += m.tokens;
    entry.totalTokens += m.tokens;
    entry.totalCost += m.cost;
    byModelName.set(m.model, entry);
  }
  return [...byModelName.values()].sort((a, b) => b.totalCost - a.totalCost);
}

function MonthlyCostChart({ monthly, currency }: { monthly: AiUsageMonth[]; currency: string }) {
  const rows = monthly.map((m) => ({ month: monthLabel(m.yearMonth), cost: m.cost }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="aiCostFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.15} />
            <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--gridline)" />
        <XAxis dataKey="month" stroke="var(--text-muted)" tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={{ stroke: "var(--baseline)" }} tickLine={false} />
        <YAxis
          tickFormatter={(v) => formatCurrency(v, currency)}
          stroke="var(--text-muted)"
          tick={{ fontSize: 11, fill: "var(--text-muted)" }}
          axisLine={false}
          tickLine={false}
          width={70}
        />
        <Tooltip
          contentStyle={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: "var(--text-primary)" }}
          formatter={(value) => [formatCurrency(Number(value), currency), "Custo"]}
        />
        <Area type="monotone" dataKey="cost" stroke="var(--series-1)" strokeWidth={2} fill="url(#aiCostFill)" dot={{ r: 3, fill: "var(--series-1)" }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function MonthlyTokensChart({ monthly }: { monthly: AiUsageMonth[] }) {
  const rows = monthly.map((m) => ({ month: monthLabel(m.yearMonth), tokens: m.tokens }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="aiTokensFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--series-3)" stopOpacity={0.15} />
            <stop offset="100%" stopColor="var(--series-3)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--gridline)" />
        <XAxis dataKey="month" stroke="var(--text-muted)" tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={{ stroke: "var(--baseline)" }} tickLine={false} />
        <YAxis
          tickFormatter={(v) => formatTokens(v)}
          stroke="var(--text-muted)"
          tick={{ fontSize: 11, fill: "var(--text-muted)" }}
          axisLine={false}
          tickLine={false}
          width={56}
        />
        <Tooltip
          contentStyle={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: "var(--text-primary)" }}
          formatter={(value) => [formatTokens(Number(value)), "Tokens"]}
        />
        <Area type="monotone" dataKey="tokens" stroke="var(--series-3)" strokeWidth={2} fill="url(#aiTokensFill)" dot={{ r: 3, fill: "var(--series-3)" }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function AiUsage() {
  const { data, isLoading, error } = useSummary();
  const refreshSummary = useRefreshSummary();
  const ai = data?.aiUsage;
  const variance =
    ai && ai.totalPriorMonthCostToDate > 0
      ? ((ai.totalMtdCost - ai.totalPriorMonthCostToDate) / ai.totalPriorMonthCostToDate) * 100
      : undefined;
  const modelBreakdown = ai ? byModelBreakdown(ai.byModel) : [];
  const hasOutro = modelBreakdown.some((m) => m.outro > 0);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div>
          <h1 className="page-title">IA / Azure OpenAI</h1>
          <p className="page-subtitle">
            Custo e consumo de tokens do Azure OpenAI (Foundry Models), mês corrente — derivado do meter detalhado do
            FOCUS export.
          </p>
        </div>
        {data && (
          <button
            onClick={() => refreshSummary.mutate()}
            disabled={refreshSummary.isPending}
            style={{
              background: "transparent",
              color: "var(--brand-accent)",
              border: "1px solid var(--brand-accent)",
              borderRadius: 6,
              padding: "6px 12px",
              fontSize: 12.5,
              fontWeight: 600,
              cursor: refreshSummary.isPending ? "default" : "pointer",
              opacity: refreshSummary.isPending ? 0.6 : 1,
              whiteSpace: "nowrap",
            }}
          >
            {refreshSummary.isPending ? "Atualizando…" : "Atualizar agora"}
          </button>
        )}
      </div>
      {refreshSummary.isError && (
        <p style={{ fontSize: 11.5, color: "var(--status-critical)", marginTop: -18, marginBottom: 18 }}>
          Não foi possível atualizar agora. Tente novamente em instantes.
        </p>
      )}

      <QueryState isLoading={isLoading} error={error} hasData={!!data}>
        {data && !ai && (
          <p className="state-message">
            Os dados agregados ainda não têm a nova seção de IA. Clique em "Atualizar agora" acima para recalcular.
          </p>
        )}
        {data && ai && (
          <>
            <div className="kpi-grid">
              <StatTile
                label="Custo no mês"
                value={formatCurrency(ai.totalMtdCost, ai.currency)}
                deltaLabel={variance !== undefined ? `${formatPercent(variance)} vs. mês anterior` : undefined}
                deltaDirection={variance === undefined ? "neutral" : variance > 0 ? "up-bad" : "down-good"}
              />
              <StatTile label="Previsão de fechamento" value={formatCurrency(ai.totalMtdForecast, ai.currency)} />
              <StatTile label="Tokens consumidos no mês" value={formatTokens(ai.totalMtdTokens)} />
              <StatTile label="Recursos com uso" value={String(ai.byResource.length)} />
            </div>

            {ai.byResource.length === 0 ? (
              <p className="state-message">Nenhum consumo de Azure OpenAI (Foundry Models) neste mês.</p>
            ) : (
              <>
                {ai.monthly.length > 1 && (
                  <div className="two-col" style={{ marginBottom: 18 }}>
                    <div className="card">
                      <p className="card-title">Custo mensal</p>
                      <MonthlyCostChart monthly={ai.monthly} currency={ai.currency} />
                    </div>
                    <div className="card">
                      <p className="card-title">Tokens consumidos por mês</p>
                      <MonthlyTokensChart monthly={ai.monthly} />
                    </div>
                  </div>
                )}

                <div className="two-col" style={{ marginBottom: 18 }}>
                  <div className="card">
                    <p className="card-title">Custo por recurso</p>
                    <RankedBarChart data={ai.byResource.map((r) => ({ name: r.resourceName, cost: r.cost }))} currency={ai.currency} />
                  </div>
                  <div className="card">
                    <p className="card-title">Custo por modelo / tipo de token</p>
                    <RankedBarChart
                      data={ai.byModel.map((m) => ({ name: `${m.model} — ${TOKEN_TYPE_LABEL[m.tokenType]}`, cost: m.cost }))}
                      currency={ai.currency}
                    />
                  </div>
                </div>

                <div className="card" style={{ marginBottom: 18 }}>
                  <p className="card-title">Detalhamento por recurso</p>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Recurso</th>
                        <th>Subscription</th>
                        <th>Tokens</th>
                        <th>Custo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ai.byResource.map((r) => (
                        <tr key={r.resourceId}>
                          <td>{r.resourceName}</td>
                          <td>{r.subscriptionName}</td>
                          <td>{formatTokens(r.tokens)}</td>
                          <td>{formatCurrency(r.cost, ai.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="card">
                  <p className="card-title">Detalhamento por modelo</p>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Modelo</th>
                        <th>Input</th>
                        <th>Output</th>
                        <th>Cache</th>
                        {hasOutro && <th>Outro</th>}
                        <th>Custo total</th>
                        <th>Custo / 1M tokens</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modelBreakdown.map((m) => (
                        <tr key={m.model}>
                          <td>{m.model}</td>
                          <td>{m.input > 0 ? formatTokens(m.input) : "—"}</td>
                          <td>{m.output > 0 ? formatTokens(m.output) : "—"}</td>
                          <td>{m.cachedInput > 0 ? formatTokens(m.cachedInput) : "—"}</td>
                          {hasOutro && <td>{m.outro > 0 ? formatTokens(m.outro) : "—"}</td>}
                          <td>{formatCurrency(m.totalCost, ai.currency)}</td>
                          <td>{costPerMillionTokens(m.totalCost, m.totalTokens, ai.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12 }}>
                    "Input (cache)" é o preço reduzido cobrado quando o prompt reaproveita conteúdo já processado
                    recentemente (prompt caching). O tipo de token é inferido do nome do meter da Azure — pode cair
                    em "Outro" quando o meter não segue o padrão usual (ex: embeddings). A previsão de fechamento usa
                    o mesmo cálculo de run-rate (custo do mês ÷ dias já passados × dias no mês) do resto do
                    dashboard.
                  </p>
                </div>
              </>
            )}
          </>
        )}
      </QueryState>
    </>
  );
}
