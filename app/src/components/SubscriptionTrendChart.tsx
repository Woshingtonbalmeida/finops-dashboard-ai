import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TrendPoint } from "../types";
import { formatCompact, formatCurrency } from "../lib/format";

interface SubscriptionTrendChartProps {
  data: TrendPoint[];
  currency: string;
  mode: "accumulated" | "daily";
}

const SERIES_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];

function dayLabel(date: string): string {
  const [, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(2000, month - 1, day)).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" });
}

export function SubscriptionTrendChart({ data, currency, mode }: SubscriptionTrendChartProps) {
  const subscriptions = [
    ...new Map(data.flatMap((d) => d.bySubscription).map((s) => [s.subscriptionId, s.subscriptionName])).entries(),
  ];

  const running = new Map(subscriptions.map(([id]) => [id, 0]));
  const rows = data.map((point) => {
    const row: Record<string, string | number> = { date: dayLabel(point.date) };
    for (const [subscriptionId, subscriptionName] of subscriptions) {
      const dayCost = point.bySubscription.find((s) => s.subscriptionId === subscriptionId)?.cost ?? 0;
      if (mode === "accumulated") {
        const total = (running.get(subscriptionId) ?? 0) + dayCost;
        running.set(subscriptionId, total);
        row[subscriptionName] = total;
      } else {
        row[subscriptionName] = dayCost;
      }
    }
    return row;
  });

  if (rows.length === 0) {
    return <p className="state-message">Ainda não há dados diários deste mês.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }} barCategoryGap={2}>
        <CartesianGrid vertical={false} stroke="var(--gridline)" />
        <XAxis
          dataKey="date"
          stroke="var(--text-muted)"
          tick={{ fontSize: 11, fill: "var(--text-muted)" }}
          axisLine={{ stroke: "var(--baseline)" }}
          tickLine={false}
          interval="preserveStartEnd"
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
          <Bar
            key={subscriptionId}
            dataKey={subscriptionName}
            stackId="trend"
            fill={SERIES_COLORS[i % SERIES_COLORS.length]}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
