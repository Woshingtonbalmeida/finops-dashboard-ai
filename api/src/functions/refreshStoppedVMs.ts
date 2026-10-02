import { app, InvocationContext, Timer } from "@azure/functions";
import { refreshStoppedVMsNow } from "../lib/stoppedVMs";

app.timer("refreshStoppedVMs", {
  schedule: "0 55 6 * * *", // daily 06:55 UTC
  handler: async (_timer: Timer, context: InvocationContext) => {
    const report = await refreshStoppedVMsNow((message) => context.warn(message));
    context.log(`VMs paradas atualizadas: ${report.vms.length} VM(s), custo residual ${report.totalMtdCost}`);
  },
});
