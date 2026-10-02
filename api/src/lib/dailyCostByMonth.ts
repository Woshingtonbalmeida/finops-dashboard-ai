import { currentMonthRows } from "./resourceCost";

export interface DailyCostByMonthPoint {
  date: string;
  cost: number;
  bySubscription: { subscriptionId: string; subscriptionName: string; cost: number }[];
}

export interface DailyCostByMonthReport {
  yearMonth: string;
  currency: string;
  trend: DailyCostByMonthPoint[];
  // Whole-month totals from the exact same rows as trend above — kept alongside it so a
  // month's "by subscription" / "by service" breakdown always agrees with its accumulated
  // chart. These deliberately do NOT reuse monthlyHistory.ts's numbers (Cost Management's
  // Query API) — that's a different Azure API from the FOCUS export this reads, and the two
  // can disagree by a percent or two. Mixing sources on one page reads as a bug even though
  // both are "correct," so every past-month figure on Visão geral comes from this one pass.
  bySubscription: { subscriptionId: string; subscriptionName: string; cost: number }[];
  byService: { service: string; cost: number }[];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// Same shape as CuratedSummary.trend in focus.ts, just computed for a single past month on
// demand instead of the rolling 60-day window kept in summary.json — lets "Acumulado no mês"
// on Visão geral jump to a month outside that window when the user clicks it.
export async function fetchDailyCostByMonth(yearMonth: string): Promise<DailyCostByMonthReport> {
  const [year, month] = yearMonth.split("-").map(Number);
  const anchor = new Date(Date.UTC(year, month - 1, 15));
  const { rows, currency } = await currentMonthRows(anchor);

  const byDate = new Map<string, number>();
  const byDateSubscription = new Map<string, Map<string, { subscriptionName: string; cost: number }>>();
  const bySubscription = new Map<string, { subscriptionName: string; cost: number }>();
  const byService = new Map<string, number>();

  for (const row of rows) {
    const dateKey = row.chargePeriodStart.toISOString().slice(0, 10);
    byDate.set(dateKey, (byDate.get(dateKey) ?? 0) + row.effectiveCost);

    const daySubs = byDateSubscription.get(dateKey) ?? new Map<string, { subscriptionName: string; cost: number }>();
    const sub = daySubs.get(row.subscriptionId) ?? { subscriptionName: row.subscriptionName, cost: 0 };
    sub.cost += row.effectiveCost;
    daySubs.set(row.subscriptionId, sub);
    byDateSubscription.set(dateKey, daySubs);

    const monthSub = bySubscription.get(row.subscriptionId) ?? { subscriptionName: row.subscriptionName, cost: 0 };
    monthSub.cost += row.effectiveCost;
    bySubscription.set(row.subscriptionId, monthSub);

    byService.set(row.serviceName, (byService.get(row.serviceName) ?? 0) + row.effectiveCost);
  }

  const trend = [...byDate.entries()]
    .map(([date, cost]) => ({
      date,
      cost: round2(cost),
      bySubscription: [...(byDateSubscription.get(date) ?? new Map()).entries()]
        .map(([subscriptionId, v]) => ({ subscriptionId, subscriptionName: v.subscriptionName, cost: round2(v.cost) }))
        .sort((a, b) => b.cost - a.cost),
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  return {
    yearMonth,
    currency,
    trend,
    bySubscription: [...bySubscription.entries()]
      .map(([subscriptionId, v]) => ({ subscriptionId, subscriptionName: v.subscriptionName, cost: round2(v.cost) }))
      .sort((a, b) => b.cost - a.cost),
    byService: [...byService.entries()]
      .map(([service, cost]) => ({ service, cost: round2(cost) }))
      .sort((a, b) => b.cost - a.cost),
  };
}
