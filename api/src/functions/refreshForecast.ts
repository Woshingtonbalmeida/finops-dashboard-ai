import { app, InvocationContext, Timer } from "@azure/functions";
import { refreshForecastNow } from "../lib/forecast";

app.timer("refreshForecast", {
  schedule: "0 15 6 * * *", // daily 06:15 UTC
  handler: async (_timer: Timer, context: InvocationContext) => {
    const report = await refreshForecastNow((message) => context.warn(message));
    context.log(`Forecast atualizado: ${report.bySubscription.length} subscription(s)`);
  },
});
