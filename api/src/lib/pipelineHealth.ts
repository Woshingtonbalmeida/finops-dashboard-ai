import { getBlobLastModified } from "./storage";

export interface PipelineHealthEntry {
  name: string;
  blobName: string;
  /** UTC schedule the underlying timer runs on, for reference — not used in status math. */
  scheduleUtc: string;
  generatedAt: string | null;
  hoursSinceGenerated: number | null;
  status: "ok" | "atencao" | "critico";
}

export interface PipelineHealthReport {
  generatedAt: string;
  entries: PipelineHealthEntry[];
}

// Every scheduled timer in api/src/functions, paired with the one curated blob it writes.
// rebuildCurated is the odd one out — it's blob-triggered (fires after triggerExportRuns'
// exports land and the per-subscription ingest triggers pick them up), not its own app.timer, but
// summary.json's freshness is what actually broke in the September OOM incident, so it's
// the most important entry here, not an afterthought.
const PIPELINES: { name: string; blobName: string; scheduleUtc: string }[] = [
  { name: "Resumo consolidado de custos (rebuildCurated)", blobName: "summary.json", scheduleUtc: "reage aos exports diários (~05:00)" },
  { name: "Histórico mensal", blobName: "monthly-history.json", scheduleUtc: "06:20" },
  { name: "Orçamentos & alertas", blobName: "budgets.json", scheduleUtc: "06:00" },
  { name: "Forecast", blobName: "forecast.json", scheduleUtc: "06:15" },
  { name: "Governança de tags", blobName: "tag-compliance.json", scheduleUtc: "06:50" },
  { name: "Visão geral de oportunidades", blobName: "optimization.json", scheduleUtc: "06:30" },
  { name: "Recursos órfãos", blobName: "orphaned-resources.json", scheduleUtc: "06:45" },
  { name: "VMs paradas", blobName: "stopped-vms.json", scheduleUtc: "06:55" },
  { name: "AKS parados", blobName: "stopped-aks.json", scheduleUtc: "06:56" },
  { name: "Economia realizada (exclusões)", blobName: "deletion-status.json", scheduleUtc: "06:57" },
  { name: "Segurança", blobName: "security.json", scheduleUtc: "07:00" },
  { name: "Candidatos à exclusão", blobName: "deletion-candidates.json", scheduleUtc: "07:05" },
  { name: "Segurança SQL", blobName: "sql-security.json", scheduleUtc: "07:05" },
  { name: "Redimensionamento AKS/App Service", blobName: "resource-sizing.json", scheduleUtc: "07:10" },
  { name: "Insights de IA", blobName: "ai-insights.json", scheduleUtc: "07:15" },
  { name: "Recurso criado", blobName: "created-resources.json", scheduleUtc: "07:20" },
];

function statusFor(hours: number | null): PipelineHealthEntry["status"] {
  if (hours === null) return "critico";
  if (hours <= 30) return "ok";
  if (hours <= 48) return "atencao";
  return "critico";
}

export async function fetchPipelineHealth(): Promise<PipelineHealthReport> {
  const now = new Date();
  const entries = await Promise.all(
    PIPELINES.map(async (p) => {
      let lastModified: Date | undefined;
      try {
        lastModified = await getBlobLastModified("curated", p.blobName);
      } catch {
        lastModified = undefined;
      }
      const hoursSinceGenerated = lastModified ? (now.getTime() - lastModified.getTime()) / (1000 * 60 * 60) : null;
      return {
        name: p.name,
        blobName: p.blobName,
        scheduleUtc: p.scheduleUtc,
        generatedAt: lastModified ? lastModified.toISOString() : null,
        hoursSinceGenerated: hoursSinceGenerated !== null ? Math.round(hoursSinceGenerated * 10) / 10 : null,
        status: statusFor(hoursSinceGenerated),
      };
    })
  );

  return {
    generatedAt: now.toISOString(),
    entries: entries.sort((a, b) => (b.hoursSinceGenerated ?? Infinity) - (a.hoursSinceGenerated ?? Infinity)),
  };
}
