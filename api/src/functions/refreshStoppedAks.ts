import { app, InvocationContext, Timer } from "@azure/functions";
import { refreshStoppedAksNow } from "../lib/stoppedAks";

app.timer("refreshStoppedAks", {
  schedule: "0 56 6 * * *", // daily 06:56 UTC
  handler: async (_timer: Timer, context: InvocationContext) => {
    const report = await refreshStoppedAksNow((message) => context.warn(message));
    context.log(`Clusters AKS parados: ${report.clusters.length}`);
  },
});
