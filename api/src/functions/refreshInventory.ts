import { app, InvocationContext, Timer } from "@azure/functions";
import { refreshInventoryNow } from "../lib/inventory";

app.timer("refreshInventory", {
  schedule: "0 25 7 * * *", // daily 07:25 UTC, after refreshCreatedResources
  handler: async (_timer: Timer, context: InvocationContext) => {
    const report = await refreshInventoryNow((message) => context.warn(message));
    context.log(`Inventário: ${report.totalResources} recursos, ${report.distinctTypes} tipos`);
  },
});
