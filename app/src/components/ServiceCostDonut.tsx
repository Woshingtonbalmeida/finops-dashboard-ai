import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatCompact, formatCurrency } from "../lib/format";

interface ServiceCostDonutProps {
  data: { service: string; cost: number }[];
  currency: string;
  maxSlices?: number;
  // When set, this slice gets the one emphasis hue and everything else — including "Outros"
  // — turns gray, per the "one series is the point, rest are context" pattern. It's also
  // guaranteed to be its own slice even if it wouldn't otherwise make the top N.
  highlightService?: string;
}

// Fixed categorical order, never cycled — same palette used by every other chart in the
// app (index.css --series-1..8), all 8 slots used here. "Outros" gets a neutral gray, not
// a 9th generated hue — past this the fixed palette runs out and slices would have to
// repeat a color, which is worse than folding them into "Outros".
const SLICE_COLORS = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
  "var(--series-7)",
  "var(--series-8)",
];
const OTHER_COLOR = "var(--text-muted)";
const HIGHLIGHT_COLOR = "var(--brand-accent)";

export function ServiceCostDonut({ data, currency, maxSlices = 8, highlightService }: ServiceCostDonutProps) {
  const sorted = [...data].filter((d) => d.cost > 0).sort((a, b) => b.cost - a.cost);
  const highlighted = highlightService ? sorted.find((d) => d.service === highlightService) : undefined;
  const pool = highlighted ? sorted.filter((d) => d.service !== highlightService) : sorted;
  const topPoolSize = highlighted ? maxSlices - 1 : maxSlices;
  const top = pool.slice(0, topPoolSize);
  const rest = pool.slice(topPoolSize);
  const restTotal = rest.reduce((sum, d) => sum + d.cost, 0);
  const named = highlighted ? [...top, highlighted] : top;
  const rawSlices = restTotal > 0 ? [...named, { service: "Outros", cost: restTotal }] : named;
  const total = rawSlices.reduce((sum, s) => sum + s.cost, 0);

  const slices = rawSlices.map((s, i) => {
    const isDimmed = Boolean(highlightService) && s.service !== highlightService;
    let color: string;
    if (highlightService) {
      color = s.service === highlightService ? HIGHLIGHT_COLOR : OTHER_COLOR;
    } else {
      color = s.service === "Outros" ? OTHER_COLOR : SLICE_COLORS[i % SLICE_COLORS.length];
    }
    return { ...s, color, opacity: isDimmed ? 0.35 : 1 };
  });

  if (slices.length === 0) {
    return <p className="state-message">Sem dados de custo por serviço neste período.</p>;
  }

  return (
    <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "center", maxWidth: 620 }}>
      <div style={{ position: "relative", flex: "0 0 280px", width: 280, height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="cost"
              nameKey="service"
              innerRadius="62%"
              outerRadius="98%"
              paddingAngle={1}
              stroke="var(--surface-1)"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {slices.map((s) => (
                <Cell key={s.service} fill={s.color} fillOpacity={s.opacity} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "var(--surface-1)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: "var(--text-primary)" }}
              formatter={(value: unknown, _name, item) => [
                `${formatCurrency(Number(value), currency)} (${((Number(value) / total) * 100).toFixed(1)}%)`,
                item.payload.service,
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            textAlign: "center",
            pointerEvents: "none",
          }}
        >
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Total</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>{formatCompact(total, currency)}</div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: "0 1 260px", width: 260 }}>
        {slices.map((s) => (
          <div key={s.service} style={{ display: "flex", alignItems: "center", gap: 10, opacity: s.opacity }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
            <span
              style={{
                fontSize: 12.5,
                color: "var(--text-secondary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: "1 1 auto",
                minWidth: 0,
              }}
            >
              {s.service}
            </span>
            <span
              style={{
                fontSize: 12.5,
                color: "var(--text-primary)",
                fontWeight: 600,
                whiteSpace: "nowrap",
                flexShrink: 0,
                fontVariantNumeric: "tabular-nums",
                textAlign: "right",
              }}
            >
              {formatCurrency(s.cost, currency)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
