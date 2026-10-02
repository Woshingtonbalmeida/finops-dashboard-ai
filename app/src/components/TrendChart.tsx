import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TrendPoint } from "../types";
import { formatCompact, formatCurrency } from "../lib/format";

interface TrendChartProps {
  data: TrendPoint[];
  currency: string;
}

const SERIES_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];

interface TooltipPayloadEntry {
  dataKey: string;
  value: number;
  color: string;
}

function TrendTooltip({
  active,
  payload,
  label,
  currency,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
  currency: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const total = payload.reduce((sum, p) => sum + p.value, 0);
  return (
    <div
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        fontSize: 12,
        padding: "8px 10px",
      }}
    >
      <p style={{ color: "var(--text-primary)", margin: "0 0 6px", fontWeight: 600 }}>{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ margin: "2px 0", display: "flex", justifyContent: "space-between", gap: 16 }}>
          <span style={{ color: p.color }}>{p.dataKey}</span>
          <span style={{ color: "var(--text-secondary)" }}>{formatCurrency(p.value, currency)}</span>
        </p>
      ))}
      <p
        style={{
          margin: "6px 0 0",
          paddingTop: 6,
          borderTop: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          fontWeight: 600,
        }}
      >
        <span style={{ color: "var(--text-primary)" }}>Total</span>
        <span style={{ color: "var(--text-primary)" }}>{formatCurrency(total, currency)}</span>
      </p>
    </div>
  );
}

export function TrendChart({ data, currency }: TrendChartProps) {
  const subscriptions = [
    ...new Map(data.flatMap((d) => d.bySubscription).map((s) => [s.subscriptionId, s.subscriptionName])).entries(),
  ];

  const rows = data.map((d) => {
    const row: Record<string, string | number> = {
      label: new Date(d.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
    };
    for (const [subscriptionId, subscriptionName] of subscriptions) {
      row[subscriptionName] = d.bySubscription.find((s) => s.subscriptionId === subscriptionId)?.cost ?? 0;
    }
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <defs>
          {subscriptions.map(([subscriptionId], i) => (
            <linearGradient key={subscriptionId} id={`trendFill-${subscriptionId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES_COLORS[i % SERIES_COLORS.length]} stopOpacity={0.35} />
              <stop offset="100%" stopColor={SERIES_COLORS[i % SERIES_COLORS.length]} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} stroke="var(--gridline)" />
        <XAxis
          dataKey="label"
          stroke="var(--text-muted)"
          tick={{ fontSize: 11, fill: "var(--text-muted)" }}
          axisLine={{ stroke: "var(--baseline)" }}
          tickLine={false}
          minTickGap={24}
        />
        <YAxis
          tickFormatter={(v) => formatCompact(v, currency)}
          stroke="var(--text-muted)"
          tick={{ fontSize: 11, fill: "var(--text-muted)" }}
          axisLine={false}
          tickLine={false}
          width={56}
        />
        <Tooltip content={<TrendTooltip currency={currency} />} />
        <Legend wrapperStyle={{ fontSize: 12, color: "var(--text-secondary)" }} />
        {subscriptions.map(([subscriptionId, subscriptionName], i) => (
          <Area
            key={subscriptionId}
            type="monotone"
            dataKey={subscriptionName}
            stackId="cost"
            stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
            strokeWidth={2}
            fill={`url(#trendFill-${subscriptionId})`}
            dot={false}
            activeDot={{ r: 4, fill: SERIES_COLORS[i % SERIES_COLORS.length], stroke: "var(--surface-1)", strokeWidth: 2 }}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
