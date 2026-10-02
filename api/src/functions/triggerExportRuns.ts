import { subscriptionIds } from "../config/client";
import { app, InvocationContext, Timer } from "@azure/functions";
import { triggerExportRun } from "../lib/costExports";



app.timer("triggerExportRuns", {
  schedule: "0 0 5 * * *", // daily 05:00 UTC (02:00 BRT) — an hour ahead of the other refresh timers
  handler: async (_timer: Timer, context: InvocationContext) => {
    for (const subscriptionId of subscriptionIds()) {
      try {
        await triggerExportRun(subscriptionId);
        context.log(`Export disparado para ${subscriptionId}`);
      } catch (err) {
        context.warn(`Falha ao disparar export de ${subscriptionId}: ${(err as Error).message}`);
      }
    }
  },
});
