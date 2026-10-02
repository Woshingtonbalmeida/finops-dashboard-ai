import { app, InvocationContext, Timer } from "@azure/functions";
import { refreshMonthlyHistoryNow } from "../lib/monthlyHistory";

app.timer("refreshMonthlyHistory", {
  schedule: "0 20 6 * * *", // daily 06:20 UTC
  handler: async (_timer: Timer, context: InvocationContext) => {
    const report = await refreshMonthlyHistoryNow((message) => context.warn(message));
    context.log(`Histórico mensal atualizado: ${report.entries.length} entrada(s)`);
  },
});
