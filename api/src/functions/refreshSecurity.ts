import { subscriptionIds } from "../config/client";
import { app, InvocationContext, Timer } from "@azure/functions";
import { writeJsonBlob } from "../lib/storage";
import { fetchSecurity } from "../lib/security";



app.timer("refreshSecurity", {
  schedule: "0 0 7 * * *", // daily 07:00 UTC
  handler: async (_timer: Timer, context: InvocationContext) => {
    // A transient error from any single Defender for Cloud call fails the whole batch (Promise.all).
    // Skip the write in that case instead of overwriting yesterday's good data with an empty result —
    // the page should show stale-but-real data over no data until the next successful run.
    let bySubscription: Awaited<ReturnType<typeof fetchSecurity>>;
    try {
      bySubscription = await fetchSecurity(subscriptionIds());
    } catch (err) {
      context.warn(`Falha ao buscar postura de segurança, mantendo dados anteriores: ${(err as Error).message}`);
      return;
    }
    await writeJsonBlob("curated", "security.json", {
      generatedAt: new Date().toISOString(),
      bySubscription,
    });
    context.log(`Segurança atualizada: ${bySubscription.length} subscription(s)`);
  },
});
