import { subscriptionIds } from "../config/client";
import { app, InvocationContext, Timer } from "@azure/functions";
import { writeJsonBlob } from "../lib/storage";
import { fetchOrphanedResources } from "../lib/orphanedResources";



app.timer("refreshOrphanedResources", {
  schedule: "0 45 6 * * *", // daily 06:45 UTC
  handler: async (_timer: Timer, context: InvocationContext) => {
    let resources: Awaited<ReturnType<typeof fetchOrphanedResources>> = [];
    try {
      resources = await fetchOrphanedResources(subscriptionIds());
    } catch (err) {
      context.warn(`Falha ao buscar recursos órfãos: ${(err as Error).message}`);
    }
    const totalMtdCost = Math.round(resources.reduce((sum, r) => sum + r.mtdCost, 0) * 100) / 100;
    await writeJsonBlob("curated", "orphaned-resources.json", {
      generatedAt: new Date().toISOString(),
      resources,
      totalMtdCost,
      currency: resources[0]?.currency ?? "BRL",
    });
    context.log(`Recursos órfãos atualizados: ${resources.length} recurso(s), custo total ${totalMtdCost}`);
  },
});
