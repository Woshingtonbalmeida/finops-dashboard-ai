import type { BudgetStatus } from "../types";
import { formatCurrency, formatPercent } from "../lib/format";

function severity(percent: number): { color: string; label: string } {
  if (percent >= 100) return { color: "var(--status-critical)", label: "Estourado" };
  if (percent >= 80) return { color: "var(--status-warning)", label: "Atenção" };
  return { color: "var(--status-good)", label: "Dentro do previsto" };
}

export function BudgetMeter({ budget }: { budget: BudgetStatus }) {
  const percent = budget.amount > 0 ? (budget.currentSpend / budget.amount) * 100 : 0;
  const { color, label } = severity(percent);
  const fillWidth = Math.min(percent, 100);

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13 }}>
        <span style={{ color: "var(--text-primary)" }}>{budget.budgetName}</span>
        <span className="status-pill">
          <span className="status-dot" style={{ background: color }} />
          {label}
        </span>
      </div>
      <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 999, height: 8, overflow: "hidden" }}>
        <div style={{ width: `${fillWidth}%`, background: color, height: "100%", borderRadius: 999 }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 12, color: "var(--text-muted)" }}>
        <span>
          {formatCurrency(budget.currentSpend, budget.currency)} de {formatCurrency(budget.amount, budget.currency)}
        </span>
        <span>{formatPercent(percent)}</span>
      </div>
    </div>
  );
}
