import { subscriptionIds } from "../config/client";
import { app, InvocationContext, Timer } from "@azure/functions";
import { writeJsonBlob } from "../lib/storage";
import { fetchResourceSizing, ResourceSizingReport } from "../lib/resourceSizing";



export async function refreshResourceSizingNow(onWarn?: (message: string) => void): Promise<ResourceSizingReport> {
  try {
    const report = await fetchResourceSizing(subscriptionIds(), onWarn);
    await writeJsonBlob("curated", "resource-sizing.json", report);
    return report;
  } catch (err) {
    onWarn?.(`Falha ao buscar sugestões de redimensionamento: ${(err as Error).message}`);
    throw err;
  }
}

app.timer("refreshResourceSizing", {
  schedule: "0 10 7 * * *", // daily 07:10 UTC
  handler: async (_timer: Timer, context: InvocationContext) => {
    try {
      const report = await refreshResourceSizingNow((message) => context.warn(message));
      context.log(`Redimensionamento atualizado: ${report.aksNodePools.length} node pool(s), ${report.appServicePlans.length} App Service Plan(s)`);
    } catch {
      // Already warned inside refreshResourceSizingNow — keep yesterday's data rather than
      // overwrite it with nothing, same reasoning as refreshSqlSecurity.ts.
    }
  },
});
