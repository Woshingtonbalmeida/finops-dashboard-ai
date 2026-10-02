import type { MonthlyServiceCost } from "../types";
import { formatCurrency } from "../lib/format";

interface ServiceMonthlyTableProps {
  data: MonthlyServiceCost[];
  currency: string;
  maxItems?: number;
}

function monthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number);
  const label = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("pt-BR", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function ServiceMonthlyTable({ data, currency, maxItems }: ServiceMonthlyTableProps) {
  const months = [...new Set(data.map((d) => d.yearMonth))].sort();

  // Sums (not overwrites) matching service+month rows — the caller may pass rows for a
  // single subscription or for several combined, and this must add up correctly either way.
  const byService = new Map<string, Map<string, number>>();
  for (const row of data) {
    if (!byService.has(row.service)) byService.set(row.service, new Map());
    const monthCosts = byService.get(row.service)!;
    monthCosts.set(row.yearMonth, (monthCosts.get(row.yearMonth) ?? 0) + row.cost);
  }

  const allServices = [...byService.entries()]
    .map(([service, monthCosts]) => ({
      service,
      monthCosts,
      total: [...monthCosts.values()].reduce((sum, v) => sum + v, 0),
    }))
    .sort((a, b) => b.total - a.total);

  const services = maxItems ? allServices.slice(0, maxItems) : allServices;
  const otherServices = maxItems ? allServices.slice(maxItems) : [];

  // Totals always cover every service, not just the rows shown above — otherwise
  // "Total Geral" would silently under-report whenever the list is capped.
  const columnTotals = months.map((m) => allServices.reduce((sum, s) => sum + (s.monthCosts.get(m) ?? 0), 0));
  const grandTotal = allServices.reduce((sum, s) => sum + s.total, 0);
  const otherColumnTotals = months.map((m) => otherServices.reduce((sum, s) => sum + (s.monthCosts.get(m) ?? 0), 0));
  const otherGrandTotal = otherServices.reduce((sum, s) => sum + s.total, 0);

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="table">
        <thead>
          <tr>
            <th>Serviço</th>
            {months.map((m) => (
              <th key={m} style={{ textAlign: "right" }}>
                {monthLabel(m)}
              </th>
            ))}
            <th style={{ textAlign: "right" }}>Total Geral</th>
          </tr>
        </thead>
        <tbody>
          {services.map((s) => (
            <tr key={s.service}>
              <td>{s.service}</td>
              {months.map((m) => (
                <td key={m} style={{ textAlign: "right" }}>
                  {formatCurrency(s.monthCosts.get(m) ?? 0, currency)}
                </td>
              ))}
              <td style={{ textAlign: "right", fontWeight: 600 }}>{formatCurrency(s.total, currency)}</td>
            </tr>
          ))}
          {otherServices.length > 0 && (
            <tr style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
              <td>Outros {otherServices.length} serviço(s)</td>
              {otherColumnTotals.map((total, i) => (
                <td key={months[i]} style={{ textAlign: "right" }}>
                  {formatCurrency(total, currency)}
                </td>
              ))}
              <td style={{ textAlign: "right" }}>{formatCurrency(otherGrandTotal, currency)}</td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 600, borderTop: "1px solid var(--border)" }}>
            <td>Total Geral</td>
            {columnTotals.map((total, i) => (
              <td key={months[i]} style={{ textAlign: "right" }}>
                {formatCurrency(total, currency)}
              </td>
            ))}
            <td style={{ textAlign: "right" }}>{formatCurrency(grandTotal, currency)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
