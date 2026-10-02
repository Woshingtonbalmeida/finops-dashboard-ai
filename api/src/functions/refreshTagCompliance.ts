import { subscriptionIds } from "../config/client";
import { app, InvocationContext, Timer } from "@azure/functions";
import { writeJsonBlob } from "../lib/storage";
import { fetchTagCompliance } from "../lib/tagCompliance";



export interface TagComplianceReport {
  generatedAt: string;
  bySubscription: Awaited<ReturnType<typeof fetchTagCompliance>>;
}

// Shared by the daily timer and the on-demand HTTP refresh, same pattern as every other
// refreshXNow in this codebase.
export async function refreshTagComplianceNow(onWarn?: (message: string) => void): Promise<TagComplianceReport> {
  let bySubscription: Awaited<ReturnType<typeof fetchTagCompliance>> = [];
  try {
    bySubscription = await fetchTagCompliance(subscriptionIds());
  } catch (err) {
    onWarn?.(`Falha ao buscar tag compliance: ${(err as Error).message}`);
  }
  const report: TagComplianceReport = { generatedAt: new Date().toISOString(), bySubscription };
  await writeJsonBlob("curated", "tag-compliance.json", report);
  return report;
}

app.timer("refreshTagCompliance", {
  schedule: "0 50 6 * * *", // daily 06:50 UTC
  handler: async (_timer: Timer, context: InvocationContext) => {
    const report = await refreshTagComplianceNow((message) => context.warn(message));
    context.log(`Tag compliance atualizado: ${report.bySubscription.length} subscription(s)`);
  },
});
