import { subscriptionIds } from "../config/client";
import { app, InvocationContext, Timer } from "@azure/functions";
import { writeJsonBlob } from "../lib/storage";
import { fetchDeletionCandidates } from "../lib/deletionCandidates";



app.timer("refreshDeletionCandidates", {
  schedule: "0 5 7 * * *", // daily 07:05 UTC
  handler: async (_timer: Timer, context: InvocationContext) => {
    let resources: Awaited<ReturnType<typeof fetchDeletionCandidates>> = [];
    try {
      resources = await fetchDeletionCandidates(subscriptionIds());
    } catch (err) {
      context.warn(`Falha ao buscar recursos marcados para exclusão: ${(err as Error).message}`);
    }
    const totalMtdCost = Math.round(resources.reduce((sum, r) => sum + r.mtdCost, 0) * 100) / 100;
    await writeJsonBlob("curated", "deletion-candidates.json", {
      generatedAt: new Date().toISOString(),
      resources,
      totalMtdCost,
      currency: resources[0]?.currency ?? "BRL",
    });
    context.log(`Recursos marcados para exclusão atualizados: ${resources.length} recurso(s), custo ${totalMtdCost}`);
  },
});
