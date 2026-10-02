import { rawContainers } from "../config/client";
import { listCsvBlobs, readTextBlob } from "./storage";
import { FocusRow, parseFocusCsv } from "./focus";



// Blob paths are exports/{exportName}/{dateRange}/{runTimestamp}/{runGuid}/*.csv, where
// dateRange is "YYYYMMDD-YYYYMMDD" for the full billing period (e.g. "20260801-20260831").
function currentBillingPeriodDateRange(now: Date): string {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${year}${pad(month + 1)}01-${year}${pad(month + 1)}${pad(lastDay)}`;
}

// Shared by costByResourceId and costByClusterIncludingNodeResourceGroup (almost always
// called with `new Date()`) and by tagsByMonth.ts (called with an anchor date inside a past
// month, to look up that month specifically) — filtering to just the relevant period's
// blobs before downloading avoids re-parsing tens/hundreds of MB of unrelated months' CSVs
// on every call. This is what made stopped-aks's on-demand refresh time out: by August it
// was downloading ~250MB of May-August CSVs just to answer a current-month query.
export async function currentMonthRows(now: Date): Promise<{ rows: FocusRow[]; currency: string }> {
  const currentPeriod = currentBillingPeriodDateRange(now);
  const rows: FocusRow[] = [];
  let currency = "BRL";

  for (const container of rawContainers()) {
    const blobNames = (await listCsvBlobs(container)).filter((name) => name.split("/")[2] === currentPeriod);
    for (const blobName of blobNames) {
      const csvText = await readTextBlob(container, blobName);
      for (const row of parseFocusCsv(csvText)) {
        if (isNaN(row.chargePeriodStart.getTime())) continue;
        if (
          row.chargePeriodStart.getUTCFullYear() !== now.getUTCFullYear() ||
          row.chargePeriodStart.getUTCMonth() !== now.getUTCMonth()
        ) {
          continue;
        }
        rows.push(row);
        currency = row.currency;
      }
    }
  }
  return { rows, currency };
}

// Day-grouped variant of costByResourceId — same rows, kept split by chargePeriodStart
// instead of summed, so callers can tell "cost while running" apart from "cost while
// stopped" (weekly realized-savings estimation needs the day-by-day shape; everyone else
// just wants the MTD total, which is a trivial sum over the day buckets below).
export async function dailyCostByResourceId(
  resourceIds: Set<string>
): Promise<{ byResource: Map<string, Map<string, number>>; currency: string }> {
  const { rows, currency } = await currentMonthRows(new Date());
  const byResource = new Map<string, Map<string, number>>();

  for (const row of rows) {
    const key = row.resourceId.toLowerCase();
    if (!resourceIds.has(key)) continue;
    const dateKey = row.chargePeriodStart.toISOString().slice(0, 10);
    const byDate = byResource.get(key) ?? new Map<string, number>();
    byDate.set(dateKey, (byDate.get(dateKey) ?? 0) + row.effectiveCost);
    byResource.set(key, byDate);
  }
  return { byResource, currency };
}

function sumByDate(byDate: Map<string, number>): number {
  let sum = 0;
  for (const v of byDate.values()) sum += v;
  return sum;
}

export async function costByResourceId(resourceIds: Set<string>): Promise<{ costs: Map<string, number>; currency: string }> {
  const { byResource, currency } = await dailyCostByResourceId(resourceIds);
  const costs = new Map<string, number>();
  for (const [key, byDate] of byResource) costs.set(key, sumByDate(byDate));
  return { costs, currency };
}

// Stopped AKS clusters: compute drops to zero, but the cluster's own resource only ever
// carries the control-plane fee (billed under its own resourceId, and only while running —
// az aks stop appears to pause it too). The load balancer, public IPs and disks left behind
// live in the auto-generated node resource group (MC_<rg>_<name>_<region>), a separate set of
// resourceIds that share no relation to the cluster's own ID beyond that resource group — so
// costByResourceId's exact-match alone always reports zero residual cost for a stopped cluster.
export async function dailyCostByClusterIncludingNodeResourceGroup(
  clusters: { resourceId: string; nodeResourceGroup: string }[]
): Promise<{ byCluster: Map<string, Map<string, number>>; currency: string }> {
  const { rows, currency } = await currentMonthRows(new Date());
  const byCluster = new Map<string, Map<string, number>>();

  const byClusterId = new Map(clusters.map((c) => [c.resourceId.toLowerCase(), c]));
  const nodeRgPrefixes = clusters
    .filter((c) => c.nodeResourceGroup)
    .map((c) => ({
      clusterKey: c.resourceId.toLowerCase(),
      prefix: `/subscriptions/${c.resourceId.toLowerCase().split("/subscriptions/")[1].split("/")[0]}/resourcegroups/${c.nodeResourceGroup.toLowerCase()}/`,
    }));

  for (const row of rows) {
    const rowId = row.resourceId.toLowerCase();
    let clusterKey: string | undefined;
    if (byClusterId.has(rowId)) {
      clusterKey = rowId;
    } else {
      clusterKey = nodeRgPrefixes.find((p) => rowId.startsWith(p.prefix))?.clusterKey;
    }
    if (!clusterKey) continue;
    const dateKey = row.chargePeriodStart.toISOString().slice(0, 10);
    const byDate = byCluster.get(clusterKey) ?? new Map<string, number>();
    byDate.set(dateKey, (byDate.get(dateKey) ?? 0) + row.effectiveCost);
    byCluster.set(clusterKey, byDate);
  }
  return { byCluster, currency };
}

export async function costByClusterIncludingNodeResourceGroup(
  clusters: { resourceId: string; nodeResourceGroup: string }[]
): Promise<{ costs: Map<string, number>; currency: string }> {
  const { byCluster, currency } = await dailyCostByClusterIncludingNodeResourceGroup(clusters);
  const costs = new Map<string, number>();
  for (const [key, byDate] of byCluster) costs.set(key, sumByDate(byDate));
  return { costs, currency };
}
