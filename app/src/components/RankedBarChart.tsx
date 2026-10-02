import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { YAxisTickContentProps } from "recharts";
import { formatCompact, formatCurrency } from "../lib/format";

interface RankedBarChartProps {
  data: { name: string; cost: number }[];
  currency: string;
  maxItems?: number;
}

const MIN_AXIS_WIDTH = 90;
const MAX_AXIS_WIDTH = 220;
const AXIS_PADDING = 14;
const MAX_LABEL_WIDTH_PX = MAX_AXIS_WIDTH - AXIS_PADDING;
const TICK_FONT = "12px system-ui, -apple-system, 'Segoe UI', sans-serif";

// A fixed px-per-character estimate undershoots for these resource group names — they're
// heavy on uppercase letters and underscores, which render wider than lowercase — so labels
// right at a character-count cap were still overflowing past the axis and getting clipped on
// the left. Measuring the actual rendered width (same technique as canvas-based text layout)
// sizes and truncates against the real pixel width instead of guessing.
let measureCtx: CanvasRenderingContext2D | null | undefined;
function textWidth(text: string): number {
  if (measureCtx === undefined) {
    measureCtx = document.createElement("canvas").getContext("2d");
    if (measureCtx) measureCtx.font = TICK_FONT;
  }
  return measureCtx ? measureCtx.measureText(text).width : text.length * 7.5;
}

// Binary-searches the longest prefix (+ "…") that still fits maxPx, so truncation is exact
// regardless of how wide this particular label's characters render.
function truncateToWidth(text: string, maxPx: number): string {
  if (textWidth(text) <= maxPx) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (textWidth(`${text.slice(0, mid)}…`) <= maxPx) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, lo)}…`;
}

// Long resource group / subscription names (e.g. "Microsoft Azure (nickname): #1234567")
// were getting clipped by the YAxis's old fixed 150px width — this truncates every label to
// fit within MAX_LABEL_WIDTH_PX and sizes the axis to the widest one actually shown (capped
// both ways), so no tick label render can ever overflow the axis for the chart to clip.
function CategoryTick({ x, y, payload }: YAxisTickContentProps) {
  const full = String(payload.value);
  const label = truncateToWidth(full, MAX_LABEL_WIDTH_PX);
  return (
    <text x={Number(x)} y={Number(y)} dy={4} textAnchor="end" fontSize={12} fill="var(--text-secondary)">
      {label}
      {label !== full && <title>{full}</title>}
    </text>
  );
}

export function RankedBarChart({ data, currency, maxItems = 10 }: RankedBarChartProps) {
  const rows = [...data]
    .sort((a, b) => b.cost - a.cost)
    .slice(0, maxItems)
    .map((d) => ({ ...d, name: d.name || "(sem nome)" }));

  const height = Math.max(rows.length * 34, 120);
  const widestLabelPx = rows.reduce((max, r) => Math.max(max, textWidth(truncateToWidth(r.name, MAX_LABEL_WIDTH_PX))), 0);
  const yAxisWidth = Math.min(Math.max(widestLabelPx + AXIS_PADDING, MIN_AXIS_WIDTH), MAX_AXIS_WIDTH);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 64, bottom: 4, left: 8 }} barCategoryGap={10}>
        <CartesianGrid horizontal={false} stroke="var(--gridline)" />
        <XAxis
          type="number"
          tickFormatter={(v) => formatCompact(v, currency)}
          stroke="var(--text-muted)"
          tick={{ fontSize: 11, fill: "var(--text-muted)" }}
          axisLine={{ stroke: "var(--baseline)" }}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={yAxisWidth}
          stroke="var(--text-secondary)"
          tick={CategoryTick}
          axisLine={{ stroke: "var(--baseline)" }}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          contentStyle={{
            background: "var(--surface-1)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12,
          }}
          labelStyle={{ color: "var(--text-primary)" }}
          formatter={(value) => [formatCurrency(Number(value), currency), "Custo"]}
        />
        <Bar dataKey="cost" fill="var(--series-1)" radius={[0, 4, 4, 0]} maxBarSize={20}>
          <LabelList
            dataKey="cost"
            position="right"
            formatter={(value: unknown) => formatCompact(Number(value), currency)}
            style={{ fill: "var(--text-secondary)", fontSize: 11 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
