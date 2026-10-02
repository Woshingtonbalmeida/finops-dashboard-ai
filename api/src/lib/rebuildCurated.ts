import { rawContainers } from "../config/client";
import { InvocationContext } from "@azure/functions";
import { listCsvBlobs, readTextBlob, writeJsonBlob } from "./storage";
import { aggregateFocusRows, FocusRow, parseFocusCsv } from "./focus";


const CURATED_CONTAINER = "curated";
const CURATED_SUMMARY_BLOB = "summary.json";

// aggregateFocusRows never looks further back than "current month + the two before it"
// (see monthWindowStart in focus.ts) — but this function used to load every export blob
// ever produced, one full month per calendar month since the pipeline started. That grew
// quietly for months without incident until September (5 months of blobs across two
// subscriptions), when it finally exceeded the Consumption plan's ~1.5GB memory ceiling and
// started OOM-crashing the worker (exit code 134) on every single trigger — summary.json
// silently stopped updating as a result. Filtering to the billing periods actually used
// keeps memory bounded regardless of how long this has been running.
function billingPeriodMonthsToKeep(now: Date, monthsBack: number): Set<string> {
  const months = new Set<string>();
  for (let i = 0; i <= monthsBack; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.add(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

// Blob paths are exports/{exportName}/{dateRange}/{runTimestamp}/{runGuid}/*.csv, where
// dateRange is "YYYYMMDD-YYYYMMDD" for the billing period the export covers.
function isRecentBillingPeriod(blobName: string, keepMonths: Set<string>): boolean {
  const startDate = blobName.split("/")[2]?.slice(0, 8); // "20260901"
  if (!startDate) return true; // unparseable path — keep it rather than silently drop data
  return keepMonths.has(startDate.slice(0, 6));
}

// Cost Management "month to date" exports overwrite the same file for the current month,
// so we simply re-read every CSV currently in the raw containers and recompute aggregates.
// Volume is small (two subscriptions, daily grain) so a full rebuild on every trigger is
// simpler and safer than incremental merging.
export async function rebuildCurated(context: InvocationContext): Promise<void> {
  const allRows: FocusRow[] = [];
  const keepMonths = billingPeriodMonthsToKeep(new Date(), 2);

  for (const container of rawContainers()) {
    const allBlobNames = await listCsvBlobs(container);
    const blobNames = allBlobNames.filter((name) => isRecentBillingPeriod(name, keepMonths));
    context.log(`${container}: ${blobNames.length} arquivo(s) CSV encontrados (de ${allBlobNames.length} no total, filtrado aos últimos 3 meses)`);
    for (const blobName of blobNames) {
      try {
        const csvText = await readTextBlob(container, blobName);
        allRows.push(...parseFocusCsv(csvText));
      } catch (err) {
        context.warn(`Falha ao ler/parsear ${container}/${blobName}: ${(err as Error).message}`);
      }
    }
  }

  const summary = aggregateFocusRows(allRows);
  await writeJsonBlob(CURATED_CONTAINER, CURATED_SUMMARY_BLOB, summary);
  context.log(
    `Curated summary atualizado: ${allRows.length} linhas processadas, MTD=${summary.totalMtdCost} ${summary.currency}`
  );
}
