import { subscriptionIds } from "../config/client";
import { DefaultAzureCredential } from "@azure/identity";
import { dailyCostByResourceId } from "./resourceCost";
import { readJsonBlob, writeJsonBlob } from "./storage";
import { CuratedSummary } from "./focus";
import { estimateWeeklyRealizedSavings, reportWeekWindow, WeeklyRealizedSavings } from "./realizedSavings";

const credential = new DefaultAzureCredential();

async function getManagementToken(): Promise<string> {
  const token = await credential.getToken("https://management.azure.com/.default");
  if (!token) throw new Error("Não foi possível obter token de acesso para management.azure.com");
  return token.token;
}

export interface StoppedVM {
  resourceId: string;
  name: string;
  subscriptionId: string;
  resourceGroup: string;
  location: string;
  osType: string;
  vmSize: string;
  /** "Deallocated" (no compute charge) or "Stopped" (still billed — allocated but off) */
  powerState: string;
  attachedDiskCount: number;
  mtdCost: number;
  currency: string;
  weeklyRealizedSavings: WeeklyRealizedSavings;
}

// One entry per stop/resume transition, mirroring stoppedAks's history — lets the weekly
// report list VM stop actions alongside AKS and deletion ones instead of only having AKS
// represented.
export interface StoppedVMHistoryEntry {
  resourceId: string;
  vmName: string;
  subscriptionId: string;
  subscriptionName: string;
  action: "Parado" | "Retomado" | "Excluído";
  changedAt: string;
  mtdCost: number;
  currency: string;
}

interface VmRow {
  id: string;
  name: string;
  subscriptionId: string;
  resourceGroup: string;
  location: string;
  osType: string | null;
  vmSize: string | null;
  powerState: string | null;
}

interface DiskRow {
  id: string;
  managedBy: string | null;
}

interface ResourceGraphResponse<T> {
  data: T[];
}

const VM_QUERY = `
Resources
| where type =~ 'microsoft.compute/virtualmachines'
| extend powerState = tostring(properties.extended.instanceView.powerState.code)
| where powerState endswith 'deallocated' or powerState endswith 'stopped'
| project id, name, subscriptionId, resourceGroup, location,
    osType = tostring(properties.storageProfile.osDisk.osType),
    vmSize = tostring(properties.hardwareProfile.vmSize),
    powerState
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

// A VM dropping out of the stopped-list means one of two very different things: it
// resumed running, or someone deleted it outright. VM_QUERY above only sees currently
// stopped/deallocated VMs, so it can't tell those apart — this checks whether the
// resource exists at all (any power state), regardless of the stopped/deallocated filter.
async function checkVmsStillExist(subscriptionIds: string[], resourceIds: string[]): Promise<Set<string>> {
  if (resourceIds.length === 0) return new Set();
  const idList = resourceIds.map((id) => `'${id.toLowerCase().replace(/'/g, "''")}'`).join(", ");
  const query = `
Resources
| where type =~ 'microsoft.compute/virtualmachines'
| where tolower(id) in (${idList})
| project id
`.trim();
  const rows = await queryResourceGraph<ExistenceRow>(subscriptionIds, query);
  return new Set(rows.map((r) => r.id.toLowerCase()));
}

function friendlyPowerState(code: string | null): string {
  const raw = (code ?? "").replace("PowerState/", "");
  if (raw === "deallocated") return "Deallocated";
  if (raw === "stopped") return "Stopped (ainda cobra compute)";
  return raw || "Desconhecido";
}

export async function fetchStoppedVMs(subscriptionIds: string[]): Promise<StoppedVM[]> {
  const vms = await queryResourceGraph<VmRow>(subscriptionIds, VM_QUERY);
  if (vms.length === 0) return [];

  const vmIds = vms.map((vm) => `'${vm.id.toLowerCase()}'`).join(",");
  const disksQuery = `
Resources
| where type =~ 'microsoft.compute/disks'
| where isnotempty(managedBy) and tolower(managedBy) in (${vmIds})
| project id, managedBy
`.trim();
  const disks = vmIds ? await queryResourceGraph<DiskRow>(subscriptionIds, disksQuery) : [];

  const disksByVm = new Map<string, string[]>();
  for (const disk of disks) {
    const vmKey = (disk.managedBy ?? "").toLowerCase();
    const list = disksByVm.get(vmKey) ?? [];
    list.push(disk.id);
    disksByVm.set(vmKey, list);
  }

  const relevantIds = new Set<string>();
  for (const vm of vms) relevantIds.add(vm.id.toLowerCase());
  for (const disk of disks) relevantIds.add(disk.id.toLowerCase());
  const { byResource, currency } = await dailyCostByResourceId(relevantIds);
  const { weekStart, today } = reportWeekWindow(new Date());

  return vms
    .map((vm) => {
      const vmKey = vm.id.toLowerCase();
      const attachedDisks = disksByVm.get(vmKey) ?? [];

      // Combine the VM's own daily cost with its attached disks' — the VM compute cost
      // drops to zero once deallocated, but disks keep billing, so a savings estimate
      // based on the VM's own cost history alone would understate what "running" cost.
      const combinedByDate = new Map<string, number>(byResource.get(vmKey) ?? []);
      for (const diskId of attachedDisks) {
        const diskByDate = byResource.get(diskId.toLowerCase());
        if (!diskByDate) continue;
        for (const [dateKey, cost] of diskByDate) {
          combinedByDate.set(dateKey, (combinedByDate.get(dateKey) ?? 0) + cost);
        }
      }

      let mtdCost = 0;
      for (const v of combinedByDate.values()) mtdCost += v;

      return {
        resourceId: vm.id,
        name: vm.name,
        subscriptionId: vm.subscriptionId,
        resourceGroup: vm.resourceGroup,
        location: vm.location,
        osType: vm.osType ?? "",
        vmSize: vm.vmSize ?? "",
        powerState: friendlyPowerState(vm.powerState),
        attachedDiskCount: attachedDisks.length,
        mtdCost: Math.round(mtdCost * 100) / 100,
        currency,
        weeklyRealizedSavings: estimateWeeklyRealizedSavings(combinedByDate, currency, weekStart, today),
      };
    })
    .sort((a, b) => b.mtdCost - a.mtdCost);
}

export interface StoppedVMsReport {
  generatedAt: string;
  vms: StoppedVM[];
  totalMtdCost: number;
  currency: string;
  history: StoppedVMHistoryEntry[];
}



// Shared by the daily timer and the on-demand HTTP refresh, mirroring
// refreshStoppedAksNow: diffs today's stopped-VM list against the last write to detect
// stop/resume transitions for the weekly report's history table.
export async function refreshStoppedVMsNow(onWarn?: (message: string) => void): Promise<StoppedVMsReport> {
  let vms: StoppedVM[] = [];
  try {
    vms = await fetchStoppedVMs(subscriptionIds());
  } catch (err) {
    onWarn?.(`Falha ao buscar VMs paradas: ${(err as Error).message}`);
  }

  const [previous, summary] = await Promise.all([
    readJsonBlob<StoppedVMsReport>("curated", "stopped-vms.json"),
    readJsonBlob<CuratedSummary>("curated", "summary.json"),
  ]);
  const subscriptionName = (id: string) =>
    summary?.bySubscription.find((s) => s.subscriptionId === id)?.subscriptionName ?? id;

  const now = new Date().toISOString();
  const previousVms = previous?.vms ?? [];
  const previousById = new Map(previousVms.map((v) => [v.resourceId.toLowerCase(), v]));
  const currentIds = new Set(vms.map((v) => v.resourceId.toLowerCase()));

  const newEvents: StoppedVMHistoryEntry[] = [];
  for (const v of vms) {
    if (!previousById.has(v.resourceId.toLowerCase())) {
      newEvents.push({
        resourceId: v.resourceId,
        vmName: v.name,
        subscriptionId: v.subscriptionId,
        subscriptionName: subscriptionName(v.subscriptionId),
        action: "Parado",
        changedAt: now,
        mtdCost: v.mtdCost,
        currency: v.currency,
      });
    }
  }
  const droppedOut = [...previousById.entries()].filter(([key]) => !currentIds.has(key));
  let stillExisting = new Set(droppedOut.map(([key]) => key));
  try {
    stillExisting = await checkVmsStillExist(
      subscriptionIds(),
      droppedOut.map(([, v]) => v.resourceId)
    );
  } catch (err) {
    // Falls back to assuming "Retomado" for all of them (the old behavior) rather than
    // mislabeling everything as deleted if this check itself fails.
    onWarn?.(`Falha ao verificar se VMs ainda existem: ${(err as Error).message}`);
  }
  for (const [key, v] of droppedOut) {
    newEvents.push({
      resourceId: v.resourceId,
      vmName: v.name,
      subscriptionId: v.subscriptionId,
      subscriptionName: subscriptionName(v.subscriptionId),
      action: stillExisting.has(key) ? "Retomado" : "Excluído",
      changedAt: now,
      mtdCost: v.mtdCost,
      currency: v.currency,
    });
  }

  const history = [...(previous?.history ?? []), ...newEvents];
  const totalMtdCost = Math.round(vms.reduce((sum, v) => sum + v.mtdCost, 0) * 100) / 100;
  const report: StoppedVMsReport = {
    generatedAt: now,
    vms,
    totalMtdCost,
    currency: vms[0]?.currency ?? previous?.currency ?? "BRL",
    history,
  };
  await writeJsonBlob("curated", "stopped-vms.json", report);
  return report;
}
