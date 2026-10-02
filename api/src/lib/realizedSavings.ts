export interface WeeklyRealizedSavings {
  dailyRunRate: number;
  amount: number;
  currency: string;
}

// A stopped VM/AKS cluster's post-stop cost isn't quite zero (residual disks, IPs,
// control plane), so "savings" isn't just "whatever it costs now" — it's the gap between
// what it used to cost while running and what it costs today. We estimate the "while
// running" rate from this month's own daily cost history (days at or above half this
// resource's peak day count as normal running days) rather than needing a separate
// tracking pipeline, then sum that gap over every day in the report window where the
// resource was actually near-zero — so a resource stopped mid-week only earns credit for
// the days it was actually off, and one already stopped before the window counts in full.
export function estimateWeeklyRealizedSavings(
  byDate: Map<string, number>,
  currency: string,
  weekStart: Date,
  today: Date
): WeeklyRealizedSavings {
  const values = [...byDate.values()];
  const maxDaily = values.length ? Math.max(...values) : 0;
  if (maxDaily <= 0) return { dailyRunRate: 0, amount: 0, currency };

  const runningDays = values.filter((v) => v >= maxDaily * 0.5);
  const dailyRunRate = runningDays.reduce((sum, v) => sum + v, 0) / runningDays.length;

  let amount = 0;
  for (let d = new Date(weekStart); d <= today; d.setUTCDate(d.getUTCDate() + 1)) {
    const dateKey = d.toISOString().slice(0, 10);
    const actual = byDate.get(dateKey) ?? 0;
    if (actual < dailyRunRate * 0.15) {
      amount += Math.max(0, dailyRunRate - actual);
    }
  }

  return {
    dailyRunRate: Math.round(dailyRunRate * 100) / 100,
    amount: Math.round(amount * 100) / 100,
    currency,
  };
}

// Mirrors the weekly report's own window (today minus 6 days, UTC) so a resource's
// realized-savings figure lines up with the same 7-day span the executive report shows.
export function reportWeekWindow(now: Date): { weekStart: Date; today: Date } {
  const today = new Date(now);
  const weekStart = new Date(now);
  weekStart.setUTCDate(weekStart.getUTCDate() - 6);
  return { weekStart, today };
}
