import { app, InvocationContext, Timer } from "@azure/functions";
import { refreshBudgetsNow } from "../lib/budgets";

app.timer("refreshBudgets", {
  schedule: "0 0 6 * * *", // daily 06:00 UTC
  handler: async (_timer: Timer, context: InvocationContext) => {
    const report = await refreshBudgetsNow((message) => context.warn(message));
    context.log(`Budgets atualizados: ${report.budgets.length} budget(s)`);
  },
});
