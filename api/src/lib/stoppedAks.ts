import { subscriptionIds } from "../config/client";
import { DefaultAzureCredential } from "@azure/identity";
import { dailyCostByClusterIncludingNodeResourceGroup } from "./resourceCost";
import { readJsonBlob, writeJsonBlob } from "./storage";
import { CuratedSummary } from "./focus";
import { estimateWeeklyRealizedSavings, reportWeekWindow, WeeklyRealizedSavings } from "./realizedSavings";

const credential = new DefaultAzureCredential();

async function getManagementToken(): Promise<string> {
  const token = await credential.getToken("https://management.azure.com/.default");
  if (!token) throw new Error("Não foi possível obter token de acesso para management.azure.com");
  return token.token;
}

export interface StoppedAksCluster {
  resourceId: string;
  name: string;
  subscriptionId: string;
  resourceGroup: string;
  location: string;
  nodeResourceGroup: string;
  tier: string;
  mtdCost: number;
  currency: string;
  weeklyRealizedSavings: WeeklyRealizedSavings;
}

// One entry per stop/resume transition — lets the weekly report answer "what did we
// stop this week and what does it still cost", mirroring the deletion-status history.
export interface StoppedAksHistoryEntry {
  resourceId: string;
  clusterName: string;
  subscriptionId: string;
  subscriptionName: string;
  action: "Parado" | "Retomado" | "Excluído";
  changedAt: string;
  mtdCost: number;
  currency: string;
}

interface AksRow {
  id: string;
  name: string;
  subscriptionId: string;
  resourceGroup: string;
  location: string;
  nodeResourceGroup: string | null;
  tier: string | null;
}

interface ResourceGraphResponse<T> {
  data: T[];
}

// az aks stop deallocates every node in the cluster (their VM Scale Sets go idle at
// zero compute cost) but leaves the cluster resource itself in place — properties.powerState
// is the field AKS exposes specifically for this, more reliable than inferring it from the
// underlying VMSS instance states.
const AKS_QUERY = `
Resources
| where type =~ 'microsoft.containerservice/managedclusters'
| extend powerState = tostring(properties.powerState.code)
| where powerState == 'Stopped'
| project id, name, subscriptionId, resourceGroup, location,
    nodeResourceGroup = tostring(properties.nodeResourceGroup),
    tier = tostring(sku.tier)
`.trim();

async function queryResourceGraph<T>(subscriptionIds: string[], query: string): Promise<T[]> {
  const token = await getManagementToken();
  const response = await fetch("https://management.azure.com/providers/Microsoft.ResourceGraph/resources?api-version=2022-10-01", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ subscriptions: subscriptionIds, query }),
  });
  if (!response.ok) {
    throw new Error(`Resource Graph -> ${response.status} ${await response.text()}`);
  }
  const data = (await response.json()) as ResourceGraphResponse<T>;
  return data.data ?? [];
}

interface ExistenceRow {
  id: string;
}

// A cluster dropping out of the stopped-list means one of two very different things:
// it resumed running, or someone deleted it outright. The AKS_QUERY above only sees
// currently-stopped clusters, so it can't tell those apart — this checks whether the
// resource exists at all (any powerState), regardless of the Stopped filter.
async function checkClustersStillExist(subscriptionIds: string[], resourceIds: string[]): Promise<Set<string>> {
  if (resourceIds.length === 0) return new Set();
  const idList = resourceIds.map((id) => `'${id.toLowerCase().replace(/'/g, "''")}'`).join(", ");
  const query = `
Resources
| where type =~ 'microsoft.containerservice/managedclusters'
| where tolower(id) in (${idList})
| project id
`.trim();
  const rows = await queryResourceGraph<ExistenceRow>(subscriptionIds, query);
  return new Set(rows.map((r) => r.id.toLowerCase()));
}

export async function fetchStoppedAksClusters(subscriptionIds: string[]): Promise<StoppedAksCluster[]> {
  const clusters = await queryResourceGraph<AksRow>(subscriptionIds, AKS_QUERY);
  if (clusters.length === 0) return [];

  // Node compute is already at zero cost while stopped — what's left is whatever the control
  // plane still bills (if anything, tier-dependent) plus the load balancer/public IPs/disks
  // left behind in the cluster's auto-generated node resource group.
  const { byCluster, currency } = await dailyCostByClusterIncludingNodeResourceGroup(
    clusters.map((c) => ({ resourceId: c.id, nodeResourceGroup: c.nodeResourceGroup ?? "" }))
  );
  const { weekStart, today } = reportWeekWindow(new Date());

  return clusters
    .map((c) => {
      const byDate = byCluster.get(c.id.toLowerCase()) ?? new Map<string, number>();
      let mtdCost = 0;
      for (const v of byDate.values()) mtdCost += v;
      return {
        resourceId: c.id,
        name: c.name,
        subscriptionId: c.subscriptionId,
        resourceGroup: c.resourceGroup,
        location: c.location,
        nodeResourceGroup: c.nodeResourceGroup ?? "",
        tier: c.tier || "Free",
        mtdCost: Math.round(mtdCost * 100) / 100,
        currency,
        weeklyRealizedSavings: estimateWeeklyRealizedSavings(byDate, currency, weekStart, today),
      };
    })
    .sort((a, b) => b.mtdCost - a.mtdCost);
}

export interface StoppedAksReport {
  generatedAt: string;
  clusters: StoppedAksCluster[];
  totalMtdCost: number;
  currency: string;
  history: StoppedAksHistoryEntry[];
}



// Shared by the daily timer and the on-demand HTTP refresh, same reasoning as
// refreshBudgetsNow: Resource Graph only tells us *current* powerState, so diffing
// against whatever the last write was (whether from the timer or a manual click) is
// the only way to detect a stop/resume — safe to call from either place, any time.
export async function refreshStoppedAksNow(onWarn?: (message: string) => void): Promise<StoppedAksReport> {
  let clusters: StoppedAksCluster[] = [];
  try {
    clusters = await fetchStoppedAksClusters(subscriptionIds());
  } catch (err) {
    onWarn?.(`Falha ao buscar clusters AKS parados: ${(err as Error).message}`);
  }

  const [previous, summary] = await Promise.all([
    readJsonBlob<StoppedAksReport>("curated", "stopped-aks.json"),
    readJsonBlob<CuratedSummary>("curated", "summary.json"),
  ]);
  const subscriptionName = (id: string) =>
    summary?.bySubscription.find((s) => s.subscriptionId === id)?.subscriptionName ?? id;

  const now = new Date().toISOString();
  const previousClusters = previous?.clusters ?? [];
  const previousById = new Map(previousClusters.map((c) => [c.resourceId.toLowerCase(), c]));
  const currentIds = new Set(clusters.map((c) => c.resourceId.toLowerCase()));

  const newEvents: StoppedAksHistoryEntry[] = [];
  for (const c of clusters) {
    if (!previousById.has(c.resourceId.toLowerCase())) {
      newEvents.push({
        resourceId: c.resourceId,
        clusterName: c.name,
        subscriptionId: c.subscriptionId,
        subscriptionName: subscriptionName(c.subscriptionId),
        action: "Parado",
        changedAt: now,
        mtdCost: c.mtdCost,
        currency: c.currency,
      });
    }
  }
  const droppedOut = [...previousById.entries()].filter(([key]) => !currentIds.has(key));
  let stillExisting = new Set(droppedOut.map(([key]) => key));
  try {
    stillExisting = await checkClustersStillExist(
      subscriptionIds(),
      droppedOut.map(([, c]) => c.resourceId)
    );
  } catch (err) {
    // Falls back to assuming "Retomado" for all of them (the old behavior) rather than
    // mislabeling everything as deleted if this check itself fails.
    onWarn?.(`Falha ao verificar se clusters ainda existem: ${(err as Error).message}`);
  }
  for (const [key, c] of droppedOut) {
    newEvents.push({
      resourceId: c.resourceId,
      clusterName: c.name,
      subscriptionId: c.subscriptionId,
      subscriptionName: subscriptionName(c.subscriptionId),
      action: stillExisting.has(key) ? "Retomado" : "Excluído",
      changedAt: now,
      mtdCost: c.mtdCost,
      currency: c.currency,
    });
  }

  const history = [...(previous?.history ?? []), ...newEvents];
  const totalMtdCost = Math.round(clusters.reduce((sum, c) => sum + c.mtdCost, 0) * 100) / 100;
  const report: StoppedAksReport = {
    generatedAt: now,
    clusters,
    totalMtdCost,
    currency: clusters[0]?.currency ?? previous?.currency ?? "BRL",
    history,
  };
  await writeJsonBlob("curated", "stopped-aks.json", report);
  return report;
}
