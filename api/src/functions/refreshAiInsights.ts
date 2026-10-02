import { app, InvocationContext, Timer } from "@azure/functions";
import { refreshAiInsightsNow } from "../lib/aiInsights";

// Runs after the other daily refreshes it depends on (optimization 06:30, stopped VMs
// 06:55, stopped AKS 06:56, deletion savings 06:57) so the data it summarizes is current.
app.timer("refreshAiInsights", {
  schedule: "0 15 7 * * *", // daily 07:15 UTC
  handler: async (_timer: Timer, context: InvocationContext) => {
    const report = await refreshAiInsightsNow((message) => context.warn(message));
    context.log(`Insights de IA atualizados: ${report.insights.length} insight(s)`);
  },
});
