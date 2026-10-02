import { DefaultAzureCredential } from "@azure/identity";
import { dailyCostByResourceId } from "./resourceCost";
import { recommendAksVmSize, recommendAppServiceSku, ResizeSuggestion } from "./vmSizing";

const credential = new DefaultAzureCredential();

// Below this, a node pool / plan is "clearly underused" enough to suggest downsizing —
// matches the language already used elsewhere in the product ("abaixo de 20-25%"). Memory
// is checked too when we have it, so we never suggest downsizing something that's CPU-idle
// but memory-bound.
const LOW_CPU_THRESHOLD = 20;
const HIGH_MEMORY_GUARD = 60;

export interface ResizeRecommendation {
  recommendedSize: string;
  currentVCpus: number;
  currentMemoryGB: number;
  recommendedVCpus: number;
  recommendedMemoryGB: number;
  estimatedMonthlySavings: number | null;
  currency: string | null;
}

function isDownsizeCandidate(avgCpuPercent: number | null, avgMemoryPercent: number | null): boolean {
  if (avgCpuPercent === null || avgCpuPercent >= LOW_CPU_THRESHOLD) return false;
  if (avgMemoryPercent !== null && avgMemoryPercent >= HIGH_MEMORY_GUARD) return false;
  return true;
}

// mtdCost is month-to-date so far — projects it to a full-month run rate the same way
// weeklyRealizedSavings elsewhere in the app turns partial-period cost into a rate, then
// applies the vCPU reduction ratio (Azure's per-vCPU price is constant within a size
// family, so this is a fair estimate, not a guess at a currency amount from nothing).
function estimateMonthlySavings(mtdCostByDate: Map<string, number> | undefined, suggestion: ResizeSuggestion): number | null {
  if (!mtdCostByDate || mtdCostByDate.size === 0) return null;
  const daysElapsed = mtdCostByDate.size;
  const mtdCost = [...mtdCostByDate.values()].reduce((sum, v) => sum + v, 0);
  const now = new Date();
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const dailyRunRate = mtdCost / daysElapsed;
  const reductionRatio = 1 - suggestion.recommended.vCpus / suggestion.current.vCpus;
  return Math.round(dailyRunRate * daysInMonth * reductionRatio * 100) / 100;
}

async function getManagementToken(): Promise<string> {
  const token = await credential.getToken("https://management.azure.com/.default");
  if (!token) throw new Error("Não foi possível obter token de acesso para management.azure.com");
  return token.token;
}

interface ResourceGraphResponse<T> {
  data: T[];
}

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

async function getJson<T>(url: string): Promise<T> {
  const token = await getManagementToken();
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    throw new Error(`GET ${url} -> ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as T;
}

interface LogAnalyticsQueryResponse {
  Tables?: { Columns: { ColumnName: string }[]; Rows: unknown[][] }[];
}

// ARM-proxied Log Analytics query — reuses the same management.azure.com token as
// everything else here instead of needing a second token audience (api.loganalytics.io).
// Only reaches clusters that already have Container Insights wired up (checked via the
// cluster's own omsagent addon before this is ever called) — never requests any new
// access inside a cluster itself, this is a read against the workspace, which the
// identity already has Reader-level access to like every other resource in the tenant.
async function queryLogAnalyticsAverage(workspaceResourceId: string, kql: string): Promise<number | null> {
  const token = await getManagementToken();
  const response = await fetch(`https://management.azure.com${workspaceResourceId}/api/query?api-version=2020-08-01`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: kql }),
  });
  if (!response.ok) {
    throw new Error(`Log Analytics query -> ${response.status} ${await response.text()}`);
  }
  const data = (await response.json()) as LogAnalyticsQueryResponse;
  const value = data.Tables?.[0]?.Rows?.[0]?.[0];
  return typeof value === "number" ? Math.round(value * 10) / 10 : null;
}

// Platform metrics (hypervisor-level CPU, App Service's own CPU/Memory %) need no agent
// or add-on to be enabled on the resource — unlike guest-level memory for VMs/VMSS, which
// requires Container Insights or a diagnostics extension most of these clusters don't
// have. That's why AKS below only gets CPU: it's the one utilization signal guaranteed to
// exist for every node pool regardless of what monitoring is configured on the cluster.
interface MetricsApiResponse {
  value: { name: { value: string }; timeseries?: { data?: { average?: number }[] }[] }[];
}

async function fetchAverageMetric(resourceId: string, metricNames: string[], days: number): Promise<Map<string, number | null>> {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days);
  const timespan = `${start.toISOString()}/${end.toISOString()}`;
  const url = `https://management.azure.com${resourceId}/providers/microsoft.insights/metrics?api-version=2018-01-01&metricnames=${encodeURIComponent(
    metricNames.join(",")
  )}&timespan=${encodeURIComponent(timespan)}&interval=P1D&aggregation=Average`;

  const result = new Map<string, number | null>();
  for (const name of metricNames) result.set(name, null);

  const data = await getJson<MetricsApiResponse>(url);
  for (const metric of data.value ?? []) {
    const points = (metric.timeseries?.[0]?.data ?? []).map((d) => d.average).filter((v): v is number => typeof v === "number");
    if (points.length > 0) {
      result.set(metric.name.value, Math.round((points.reduce((sum, v) => sum + v, 0) / points.length) * 10) / 10);
    }
  }
  return result;
}

export interface AksNodePoolUtilization {
  clusterName: string;
  poolName: string;
  subscriptionId: string;
  vmSize: string;
  nodeCount: number;
  avgCpuPercent: number | null;
  // "Real" memory (% of allocatable) from the cluster's own Container Insights, when
  // that add-on is enabled — null on clusters without it, never a guessed number.
  avgMemoryPercent: number | null;
  scaleSetPriority: string; // "Regular" or "Spot"
  osDiskType: string; // "Managed" or "Ephemeral" — Ephemeral has no separate disk cost at all
  osDiskSku: string | null; // Premium_LRS / StandardSSD_LRS / Standard_LRS, from the actual disks
  resizeRecommendation: ResizeRecommendation | null;
}

interface AksClusterRow {
  id: string;
  name: string;
  subscriptionId: string;
  nodeResourceGroup: string | null;
  omsEnabled: boolean;
  logAnalyticsWorkspaceId: string | null;
}

interface AgentPool {
  name: string;
  properties: { vmSize: string; count: number; scaleSetPriority?: string; osDiskType?: string };
}

interface VmssRow {
  id: string;
  name: string;
}

interface DiskRow {
  skuName: string;
  managedBy: string | null;
}

// Only running clusters — a stopped one has zero utilization by definition and isn't a
// sizing question, it's already covered by the stopped-AKS realized-savings flow.
const AKS_QUERY = `
Resources
| where type =~ 'microsoft.containerservice/managedclusters'
| extend powerState = tostring(properties.powerState.code)
| where powerState != 'Stopped'
| project id, name, subscriptionId, nodeResourceGroup = tostring(properties.nodeResourceGroup),
    omsEnabled = tobool(coalesce(properties.addonProfiles.omsagent.enabled, properties.addonProfiles.omsAgent.enabled)),
    logAnalyticsWorkspaceId = tostring(coalesce(properties.addonProfiles.omsagent.config.logAnalyticsWorkspaceResourceID, properties.addonProfiles.omsAgent.config.logAnalyticsWorkspaceResourceID))
`.trim();

export async function fetchAksNodePoolUtilization(subscriptionIds: string[], onWarn?: (message: string) => void): Promise<AksNodePoolUtilization[]> {
  const clusters = await queryResourceGraph<AksClusterRow>(subscriptionIds, AKS_QUERY);
  const results: AksNodePoolUtilization[] = [];
  // Parallel to `results` — the VMSS resourceId behind each entry, kept around just long
  // enough to batch-fetch this month's cost for all of them in one pass at the end.
  const vmssIdByResult: (string | null)[] = [];

  for (const cluster of clusters) {
    try {
      const [agentPools, vmssInPool, disks] = await Promise.all([
        getJson<{ value: AgentPool[] }>(`https://management.azure.com${cluster.id}/agentPools?api-version=2023-10-01`),
        cluster.nodeResourceGroup
          ? queryResourceGraph<VmssRow>([cluster.subscriptionId], `
Resources
| where type =~ 'microsoft.compute/virtualmachinescalesets'
| where resourceGroup =~ '${cluster.nodeResourceGroup.replace(/'/g, "''")}'
| project id, name
`.trim())
          : Promise.resolve<VmssRow[]>([]),
        // OS disk SKU isn't exposed on the agent pool itself — only the actual managed
        // disks in the node resource group carry it, keyed to their VM via managedBy.
        cluster.nodeResourceGroup
          ? queryResourceGraph<DiskRow>([cluster.subscriptionId], `
Resources
| where type =~ 'microsoft.compute/disks'
| where resourceGroup =~ '${cluster.nodeResourceGroup.replace(/'/g, "''")}'
| project skuName = tostring(sku.name), managedBy
`.trim())
          : Promise.resolve<DiskRow[]>([]),
      ]);

      const diskSkuSample = disks.find((d) => d.managedBy)?.skuName ?? disks[0]?.skuName ?? null;

      // AKS names each node pool's VMSS "aks-<poolname>-<hash>-vmss" in the node resource
      // group — matching by that prefix is the only link between a pool and its VMSS,
      // there's no direct resourceId reference either way in the ARM APIs.
      for (const pool of agentPools.value ?? []) {
        const vmss = vmssInPool.find((v) => v.name.toLowerCase().startsWith(`aks-${pool.name.toLowerCase()}-`));
        let avgCpuPercent: number | null = null;
        if (vmss) {
          try {
            const metrics = await fetchAverageMetric(vmss.id, ["Percentage CPU"], 30);
            avgCpuPercent = metrics.get("Percentage CPU") ?? null;
          } catch (err) {
            onWarn?.(`Falha ao buscar métricas do node pool ${pool.name} (${cluster.name}): ${(err as Error).message}`);
          }
        }

        let avgMemoryPercent: number | null = null;
        if (cluster.omsEnabled && cluster.logAnalyticsWorkspaceId) {
          try {
            avgMemoryPercent = await queryLogAnalyticsAverage(
              cluster.logAnalyticsWorkspaceId,
              `Perf
| where TimeGenerated > ago(30d)
| where ObjectName == "K8SNode" and CounterName == "memoryRssPercentage"
| where Computer startswith "aks-${pool.name.toLowerCase()}-"
| summarize avg(CounterValue)`
            );
          } catch (err) {
            onWarn?.(`Falha ao buscar memória (Container Insights) do node pool ${pool.name} (${cluster.name}): ${(err as Error).message}`);
          }
        }

        results.push({
          clusterName: cluster.name,
          poolName: pool.name,
          subscriptionId: cluster.subscriptionId,
          vmSize: pool.properties.vmSize,
          nodeCount: pool.properties.count,
          avgCpuPercent,
          avgMemoryPercent,
          scaleSetPriority: pool.properties.scaleSetPriority ?? "Regular",
          osDiskType: pool.properties.osDiskType ?? "Managed",
          osDiskSku: diskSkuSample,
          resizeRecommendation: null, // filled in below, once we've batched this month's costs
        });
        vmssIdByResult.push(isDownsizeCandidate(avgCpuPercent, avgMemoryPercent) && vmss ? vmss.id : null);
      }
    } catch (err) {
      onWarn?.(`Falha ao buscar node pools do cluster ${cluster.name}: ${(err as Error).message}`);
    }
  }

  const candidateVmssIds = new Set(vmssIdByResult.filter((id): id is string => id !== null).map((id) => id.toLowerCase()));
  if (candidateVmssIds.size > 0) {
    try {
      const { byResource, currency } = await dailyCostByResourceId(candidateVmssIds);
      results.forEach((result, i) => {
        const vmssId = vmssIdByResult[i];
        if (!vmssId) return;
        const suggestion = recommendAksVmSize(result.vmSize);
        if (!suggestion) return;
        const costByDate = byResource.get(vmssId.toLowerCase());
        result.resizeRecommendation = {
          recommendedSize: suggestion.recommendedSize,
          currentVCpus: suggestion.current.vCpus,
          currentMemoryGB: suggestion.current.memoryGB,
          recommendedVCpus: suggestion.recommended.vCpus,
          recommendedMemoryGB: suggestion.recommended.memoryGB,
          estimatedMonthlySavings: estimateMonthlySavings(costByDate, suggestion),
          currency,
        };
      });
    } catch (err) {
      onWarn?.(`Falha ao buscar custo dos node pools candidatos a redimensionamento: ${(err as Error).message}`);
    }
  }

  return results;
}

export interface AppServicePlanUtilization {
  name: string;
  subscriptionId: string;
  tier: string;
  size: string;
  capacity: number;
  avgCpuPercent: number | null;
  avgMemoryPercent: number | null;
  resizeRecommendation: ResizeRecommendation | null;
}

interface AppServicePlanRow {
  id: string;
  name: string;
  subscriptionId: string;
  tier: string | null;
  size: string | null;
  capacity: number | null;
}

// Free/Shared/Basic tiers don't expose CPU/Memory Percentage metrics (no dedicated
// compute to measure) and are already the cheapest tier there is, so there's nothing
// actionable to say about them here — only worth analyzing from Premium/Standard up.
const APP_SERVICE_PLAN_QUERY = `
Resources
| where type =~ 'microsoft.web/serverfarms'
| where sku.tier !in ('Free', 'Shared', 'Basic')
| project id, name, subscriptionId, tier = tostring(sku.tier), size = tostring(sku.size), capacity = toint(sku.capacity)
`.trim();

export async function fetchAppServicePlanUtilization(
  subscriptionIds: string[],
  onWarn?: (message: string) => void
): Promise<AppServicePlanUtilization[]> {
  const plans = await queryResourceGraph<AppServicePlanRow>(subscriptionIds, APP_SERVICE_PLAN_QUERY);
  const results: AppServicePlanUtilization[] = [];
  const candidateIds = new Set<string>();

  for (const plan of plans) {
    let avgCpuPercent: number | null = null;
    let avgMemoryPercent: number | null = null;
    try {
      const metrics = await fetchAverageMetric(plan.id, ["CpuPercentage", "MemoryPercentage"], 30);
      avgCpuPercent = metrics.get("CpuPercentage") ?? null;
      avgMemoryPercent = metrics.get("MemoryPercentage") ?? null;
    } catch (err) {
      onWarn?.(`Falha ao buscar métricas do App Service Plan ${plan.name}: ${(err as Error).message}`);
    }
    if (isDownsizeCandidate(avgCpuPercent, avgMemoryPercent) && recommendAppServiceSku(plan.size ?? "")) {
      candidateIds.add(plan.id.toLowerCase());
    }
    results.push({
      name: plan.name,
      subscriptionId: plan.subscriptionId,
      tier: plan.tier ?? "",
      size: plan.size ?? "",
      capacity: plan.capacity ?? 1,
      avgCpuPercent,
      avgMemoryPercent,
      resizeRecommendation: null, // filled in below, once we've batched this month's costs
    });
  }

  if (candidateIds.size > 0) {
    try {
      const { byResource, currency } = await dailyCostByResourceId(candidateIds);
      for (const result of results) {
        const plan = plans.find((p) => p.name === result.name && p.subscriptionId === result.subscriptionId);
        if (!plan || !candidateIds.has(plan.id.toLowerCase())) continue;
        const suggestion = recommendAppServiceSku(result.size);
        if (!suggestion) continue;
        const costByDate = byResource.get(plan.id.toLowerCase());
        result.resizeRecommendation = {
          recommendedSize: suggestion.recommendedSize,
          currentVCpus: suggestion.current.vCpus,
          currentMemoryGB: suggestion.current.memoryGB,
          recommendedVCpus: suggestion.recommended.vCpus,
          recommendedMemoryGB: suggestion.recommended.memoryGB,
          estimatedMonthlySavings: estimateMonthlySavings(costByDate, suggestion),
          currency,
        };
      }
    } catch (err) {
      onWarn?.(`Falha ao buscar custo dos App Service Plans candidatos a redimensionamento: ${(err as Error).message}`);
    }
  }

  return results;
}
