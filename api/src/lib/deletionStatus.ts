import { readJsonBlob, writeJsonBlob } from "./storage";
import { dailyCostByResourceId } from "./resourceCost";
import { estimateWeeklyRealizedSavings, reportWeekWindow, WeeklyRealizedSavings } from "./realizedSavings";

export const DELETION_STATUS_VALUES = ["Identificado", "Em análise", "Aprovado", "Agendado", "Parado", "Excluído"] as const;
export type DeletionStatusValue = (typeof DELETION_STATUS_VALUES)[number];

export interface DeletionStatusEntry {
  resourceId: string;
  status: DeletionStatusValue;
  updatedAt: string;
}

// One entry per status change, kept even after the current status moves on again —
// this is what lets the weekly executive report answer "what did we do this week and
// what did it cost", independent of whether the resource is still in the daily refresh.
export interface DeletionStatusHistoryEntry {
  resourceId: string;
  resourceName: string;
  subscriptionId: string;
  subscriptionName: string;
  status: DeletionStatusValue;
  previousStatus: DeletionStatusValue | null;
  changedAt: string;
  monthlyCost: number;
  currency: string;
  // Only set for "Excluído" entries, and only once the resource's own cost history
  // confirms it — see refreshDeletionSavingsNow. Absent until the first refresh after the
  // status change; the weekly report falls back to monthlyCost until then.
  weeklyRealizedSavings?: WeeklyRealizedSavings;
}

export interface DeletionStatusReport {
  updatedAt: string;
  statuses: DeletionStatusEntry[];
  history: DeletionStatusHistoryEntry[];
}

export interface SetDeletionStatusInput {
  resourceId: string;
  status: DeletionStatusValue;
  resourceName: string;
  subscriptionId: string;
  subscriptionName: string;
  monthlyCost: number;
  currency: string;
}

const CURATED_CONTAINER = "curated";
const BLOB_NAME = "deletion-status.json";

export async function readDeletionStatuses(): Promise<DeletionStatusReport> {
  const existing = await readJsonBlob<DeletionStatusReport>(CURATED_CONTAINER, BLOB_NAME);
  if (!existing) return { updatedAt: new Date().toISOString(), statuses: [], history: [] };
  // Blobs written before history-tracking was added lack the field entirely.
  return { ...existing, history: existing.history ?? [] };
}

function isValidStatus(value: unknown): value is DeletionStatusValue {
  return typeof value === "string" && (DELETION_STATUS_VALUES as readonly string[]).includes(value);
}

function isValidInput(value: unknown): value is SetDeletionStatusInput {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.resourceId === "string" &&
    v.resourceId.length > 0 &&
    isValidStatus(v.status) &&
    typeof v.resourceName === "string" &&
    typeof v.subscriptionId === "string" &&
    typeof v.subscriptionName === "string" &&
    typeof v.monthlyCost === "number" &&
    typeof v.currency === "string"
  );
}

// Read-modify-write on a single resourceId — fine for one-off edits, but multiple
// concurrent calls (e.g. one per resource in a bulk apply) race on the same blob: each
// reads the same starting state, so only the last one to finish writing survives and the
// others are silently lost. Bulk callers must use setDeletionStatusBulk instead, which
// applies every change in one read-modify-write.
export async function setDeletionStatus(input: unknown): Promise<DeletionStatusReport> {
  if (!isValidInput(input)) {
    throw new Error("Payload inválido: esperado { resourceId, status, resourceName, subscriptionId, subscriptionName, monthlyCost, currency }");
  }
  return setDeletionStatusBulk([input]);
}

// Applies every input in a single read-modify-write, so a bulk apply across many
// resources can't race with itself the way N individual setDeletionStatus calls would.
export async function setDeletionStatusBulk(inputs: unknown[]): Promise<DeletionStatusReport> {
  if (!Array.isArray(inputs) || inputs.length === 0 || !inputs.every(isValidInput)) {
    throw new Error("Payload inválido: esperado uma lista de { resourceId, status, resourceName, subscriptionId, subscriptionName, monthlyCost, currency }");
  }
  const validInputs = inputs as SetDeletionStatusInput[];
  const current = await readDeletionStatuses();
  const now = new Date().toISOString();

  let statuses = current.statuses;
  const history = [...current.history];
  for (const input of validInputs) {
    const key = input.resourceId.toLowerCase();
    const previous = statuses.find((s) => s.resourceId.toLowerCase() === key);
    statuses = statuses.filter((s) => s.resourceId.toLowerCase() !== key);
    statuses.push({ resourceId: input.resourceId, status: input.status, updatedAt: now });
    history.push({
      resourceId: input.resourceId,
      resourceName: input.resourceName,
      subscriptionId: input.subscriptionId,
      subscriptionName: input.subscriptionName,
      status: input.status,
      previousStatus: previous?.status ?? null,
      changedAt: now,
      monthlyCost: input.monthlyCost,
      currency: input.currency,
    });
  }

  const report: DeletionStatusReport = { updatedAt: now, statuses, history };
  await writeJsonBlob(CURATED_CONTAINER, BLOB_NAME, report);
  return report;
}

// "Excluído" only means the user clicked the status change — it doesn't confirm the
// resource was actually removed from Azure. This checks the resource's own real cost
// history and only credits savings for days its cost was actually near-zero, the same way
// stopped VMs/AKS are verified, instead of trusting the monthlyCost snapshot at face value
// forever. Runs as a daily timer (mirroring refreshStoppedAksNow/refreshStoppedVMsNow) —
// re-scanning every "Excluído" entry each time (not just this week's) is what lets a late
// removal still pick up its savings once cost data finally drops, and it's all one CSV
// scan regardless of how many resources are involved.
export async function refreshDeletionSavingsNow(): Promise<DeletionStatusReport> {
  const current = await readDeletionStatuses();
  const excluded = current.history.filter((h) => h.status === "Excluído");
  if (excluded.length === 0) return current;

  const resourceIds = new Set(excluded.map((h) => h.resourceId.toLowerCase()));
  const { byResource, currency } = await dailyCostByResourceId(resourceIds);
  const { weekStart, today } = reportWeekWindow(new Date());

  const history = current.history.map((h) => {
    if (h.status !== "Excluído") return h;
    const byDate = byResource.get(h.resourceId.toLowerCase()) ?? new Map<string, number>();
    return { ...h, weeklyRealizedSavings: estimateWeeklyRealizedSavings(byDate, currency, weekStart, today) };
  });

  const report: DeletionStatusReport = { ...current, history };
  await writeJsonBlob(CURATED_CONTAINER, BLOB_NAME, report);
  return report;
}
