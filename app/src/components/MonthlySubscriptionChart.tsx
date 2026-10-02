import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MonthlySubscriptionCost } from "../types";
import { formatCompact, formatCurrency } from "../lib/format";

interface MonthlySubscriptionChartProps {
  data: MonthlySubscriptionCost[];
  currency: string;
}

const SERIES_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];

function monthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number);
  const label = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("pt-BR", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function MonthlySubscriptionChart({ data, currency }: MonthlySubscriptionChartProps) {
  const months = [...new Set(data.map((d) => d.yearMonth))].sort();
  const subscriptions = [...new Map(data.map((d) => [d.subscriptionId, d.subscriptionName])).entries()];

  const rows = months.map((yearMonth) => {
    const row: Record<string, string | number> = { month: monthLabel(yearMonth) };
    for (const [subscriptionId, subscriptionName] of subscriptions) {
      row[subscriptionName] = data.find((d) => d.yearMonth === yearMonth && d.subscriptionId === subscriptionId)?.cost ?? 0;
    }
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--gridline)" />
        <XAxis
          dataKey="month"
          stroke="var(--text-muted)"
          tick={{ fontSize: 11, fill: "var(--text-muted)" }}
          axisLine={{ stroke: "var(--baseline)" }}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v) => formatCompact(v, currency)}
          stroke="var(--text-muted)"
          tick={{ fontSize: 11, fill: "var(--text-muted)" }}
          axisLine={false}
          tickLine={false}
          width={56}
        />
        <Tooltip
          contentStyle={{
            background: "var(--surface-1)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12,
          }}
          labelStyle={{ color: "var(--text-primary)" }}
          formatter={(value: unknown, name) => [formatCurrency(Number(value), currency), name as string]}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: "var(--text-secondary)" }} />
        {subscriptions.map(([subscriptionId, subscriptionName], i) => (
          <Line
            key={subscriptionId}
            type="monotone"
            dataKey={subscriptionName}
            stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
            strokeWidth={2}
            dot={{ r: 4, fill: SERIES_COLORS[i % SERIES_COLORS.length], strokeWidth: 0 }}
            activeDot={{ r: 5, fill: SERIES_COLORS[i % SERIES_COLORS.length], stroke: "var(--surface-1)", strokeWidth: 2 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
