import { app, InvocationContext, Timer } from "@azure/functions";
import { refreshCreatedResourcesNow } from "../lib/createdResources";

app.timer("refreshCreatedResources", {
  schedule: "0 20 7 * * *", // daily 07:20 UTC
  handler: async (_timer: Timer, context: InvocationContext) => {
    const report = await refreshCreatedResourcesNow((message) => context.warn(message));
    context.log(`Recursos rastreados: ${report.resources.length}`);
  },
});
