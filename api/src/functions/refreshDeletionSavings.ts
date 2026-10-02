import { app, InvocationContext, Timer } from "@azure/functions";
import { refreshDeletionSavingsNow } from "../lib/deletionStatus";

app.timer("refreshDeletionSavings", {
  schedule: "0 57 6 * * *", // daily 06:57 UTC
  handler: async (_timer: Timer, context: InvocationContext) => {
    const report = await refreshDeletionSavingsNow();
    const excluded = report.history.filter((h) => h.status === "Excluído").length;
    context.log(`Economia de exclusões recalculada: ${excluded} entrada(s) "Excluído" verificada(s)`);
  },
});
