import { subscriptionIds } from "../config/client";
import { app, InvocationContext, Timer } from "@azure/functions";
import { writeJsonBlob } from "../lib/storage";
import {
  deriveFxRateFromReservations,
  fetchAdvisorRecommendations,
  fetchReservations,
  fetchSavingsPlans,
  OptimizationReport,
} from "../lib/optimization";



// Shared by the daily timer and the on-demand HTTP refresh, same reasoning as
// refreshStoppedAksNow: this is best-effort per section, so a failure in one
// (Advisor, reservations, savings plans) doesn't blank out the others.
export async function refreshOptimizationNow(onWarn?: (message: string) => void): Promise<OptimizationReport> {
  let reservations: Awaited<ReturnType<typeof fetchReservations>> = [];
  try {
    reservations = await fetchReservations();
  } catch (err) {
    onWarn?.(`Falha ao buscar reservations: ${(err as Error).message}`);
  }

  // Reservation invoices carry a real, locked-in USD -> billing-currency rate; reuse
  // it to convert Advisor's USD-only savings estimates instead of an external FX API.
  const fx = deriveFxRateFromReservations(reservations);

  let advisorRecommendations: Awaited<ReturnType<typeof fetchAdvisorRecommendations>> = [];
  try {
    advisorRecommendations = await fetchAdvisorRecommendations(subscriptionIds(), fx);
  } catch (err) {
    onWarn?.(`Falha ao buscar Advisor: ${(err as Error).message}`);
  }

  let savingsPlans: Awaited<ReturnType<typeof fetchSavingsPlans>> = [];
  try {
    savingsPlans = await fetchSavingsPlans();
  } catch (err) {
    onWarn?.(`Falha ao buscar savings plans: ${(err as Error).message}`);
  }

  const report: OptimizationReport = {
    generatedAt: new Date().toISOString(),
    advisorRecommendations,
    reservations,
    savingsPlans,
  };
  await writeJsonBlob("curated", "optimization.json", report);
  return report;
}

app.timer("refreshOptimization", {
  schedule: "0 30 6 * * *", // daily 06:30 UTC, after refreshBudgets
  handler: async (_timer: Timer, context: InvocationContext) => {
    const report = await refreshOptimizationNow((message) => context.warn(message));
    context.log(
      `Optimization atualizado: ${report.advisorRecommendations.length} grupos de recomendações, ${report.reservations.length} reservations, ${report.savingsPlans.length} savings plans`
    );
  },
});
