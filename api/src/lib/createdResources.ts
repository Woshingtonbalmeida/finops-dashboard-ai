import { subscriptionIds } from "../config/client";
import { readJsonBlob, writeJsonBlob } from "./storage";
import { CuratedSummary } from "./focus";
import { EXCLUDE_MANAGED_RG_FILTER, queryResourceGraphAll } from "./resourceGraph";

interface CurrentResourceRow {
  id: string;
  name: string;
  type: string;
  subscriptionId: string;
  resourceGroup: string;
  location: string;
}

const CURRENT_RESOURCES_QUERY = `
Resources
| ${EXCLUDE_MANAGED_RG_FILTER}
| project id, name, type, subscriptionId, resourceGroup, location
`.trim();

interface ResourceCreateRow {
  targetId: string;
  ts: string;
  changedBy: string | null;
  changedByType: string | null;
}

// Azure Resource Graph's Change History only retains ~14 days — a "Create" event older
// than that simply isn't returned, there's no way to page further back for it. Anything
// created before this window is Resource Graph's blind spot, not ours.
const RESOURCE_CREATES_QUERY = `
resourcechanges
| extend changeType = tostring(properties.changeType), ts = tostring(properties.changeAttributes.timestamp), targetId = tolower(tostring(properties.targetResourceId)), resourceGroup = tostring(split(properties.targetResourceId, "/")[4]), changedBy = tostring(properties.changeAttributes.changedBy), changedByType = tostring(properties.changeAttributes.changedByType)
| where changeType == "Create"
| ${EXCLUDE_MANAGED_RG_FILTER}
| project targetId, ts, changedBy, changedByType
| order by ts asc
`.trim();

export interface CreatedResourceEntry {
  resourceId: string;
  name: string;
  type: string;
  subscriptionId: string;
  subscriptionName: string;
  resourceGroup: string;
  location: string;
  /** Real creation timestamp from Azure Change History, or null when Azure no longer has it. */
  createdAt: string | null;
  dateSource: "azure" | "desconhecido";
  /** When our own pipeline first recorded this resource — always known, unlike createdAt. */
  firstSeenAt: string;
  /** Who/what made the change: a user's UPN/email, a service principal's object ID, or "System"
   *  for Azure-internal changes — only ever known alongside a real createdAt. */
  createdBy: string | null;
  createdByType: string | null;
  /** Re-evaluated every run from the current resource inventory — flips back to "Ativo" if a
   *  resourceId reappears (e.g. a resource group/name reused after deletion). */
  status: "Ativo" | "Excluído";
  /** When we first noticed the resource was gone — best-effort detection time, not a precise
   *  deletion timestamp. Cleared if the resource comes back. */
  deletedAt: string | null;
}

export interface CreatedResourcesReport {
  generatedAt: string;
  resources: CreatedResourceEntry[];
}



// Resource Graph's Change History window (~14 days) is shorter than how long resources have
// existed in these subscriptions, so there's no single query that gives every resource's real
// creation date. Instead: the first time we ever see a resourceId, if Azure still has its
// Create event we record the real date; otherwise we honestly record "desconhecido" rather than
// invent one. Because this runs daily — comfortably inside the 14-day window — any resource
// genuinely created from now on is guaranteed to get its real date the first time we see it.
export async function refreshCreatedResourcesNow(onWarn?: (message: string) => void): Promise<CreatedResourcesReport> {
  const [previous, summary] = await Promise.all([
    readJsonBlob<CreatedResourcesReport>("curated", "created-resources.json"),
    readJsonBlob<CuratedSummary>("curated", "summary.json"),
  ]);
  const subscriptionName = (id: string) =>
    summary?.bySubscription.find((s) => s.subscriptionId === id)?.subscriptionName ?? id;

  let current: CurrentResourceRow[] = [];
  try {
    current = await queryResourceGraphAll<CurrentResourceRow>(subscriptionIds(), CURRENT_RESOURCES_QUERY);
  } catch (err) {
    onWarn?.(`Falha ao listar recursos atuais: ${(err as Error).message}`);
    // Without a current inventory there's nothing safe to do — keep whatever was recorded
    // before rather than writing an empty report over real data.
    return previous ?? { generatedAt: new Date().toISOString(), resources: [] };
  }

  let creates: ResourceCreateRow[] = [];
  try {
    creates = await queryResourceGraphAll<ResourceCreateRow>(subscriptionIds(), RESOURCE_CREATES_QUERY);
  } catch (err) {
    onWarn?.(`Falha ao ler o histórico de criação (Change History): ${(err as Error).message}`);
  }
  // Query orders ascending, so a later "set" for the same id (last write wins) keeps the
  // most recent Create event if a resourceId was ever created more than once in the window.
  const createEventById = new Map<string, ResourceCreateRow>();
  for (const c of creates) createEventById.set(c.targetId, c);

  const now = new Date().toISOString();
  const previousResources = previous?.resources ?? [];
  const alreadyTracked = new Set(previousResources.map((r) => r.resourceId.toLowerCase()));
  const currentIds = new Set(current.map((r) => r.id.toLowerCase()));

  // Entries recorded before createdBy/createdByType existed in this schema were never
  // enriched with them — backfill from Change History whenever it's still there (same
  // ~14-day window as everything else), without touching createdAt/dateSource, which stay
  // permanent once set. If the Create event has since aged out, it stays "—" for good; that's
  // the same honest gap as "desconhecido", just discovered a bit later.
  //
  // Status is re-evaluated every run against the current inventory rather than latched once —
  // a resource stays visible forever once created, but flips to "Excluído" (and back to "Ativo"
  // if the same id ever reappears) so deletions show up without dropping the row.
  const backfilledResources = previousResources.map((r) => {
    const key = r.resourceId.toLowerCase();
    const stillExists = currentIds.has(key);
    let entry = r;
    if (r.dateSource === "azure" && !r.createdBy) {
      const createEvent = createEventById.get(key);
      if (createEvent) entry = { ...entry, createdBy: createEvent.changedBy, createdByType: createEvent.changedByType };
    }
    if (stillExists && entry.status !== "Ativo") entry = { ...entry, status: "Ativo", deletedAt: null };
    if (!stillExists && entry.status !== "Excluído") entry = { ...entry, status: "Excluído", deletedAt: now };
    return entry;
  });

  const newEntries: CreatedResourceEntry[] = [];
  for (const r of current) {
    const key = r.id.toLowerCase();
    if (alreadyTracked.has(key)) continue;
    const createEvent = createEventById.get(key);
    newEntries.push({
      resourceId: r.id,
      name: r.name,
      type: r.type,
      subscriptionId: r.subscriptionId,
      subscriptionName: subscriptionName(r.subscriptionId),
      resourceGroup: r.resourceGroup,
      location: r.location,
      createdAt: createEvent?.ts ?? null,
      dateSource: createEvent ? "azure" : "desconhecido",
      firstSeenAt: now,
      createdBy: createEvent?.changedBy ?? null,
      createdByType: createEvent?.changedByType ?? null,
      status: "Ativo",
      deletedAt: null,
    });
  }

  const report: CreatedResourcesReport = {
    generatedAt: now,
    resources: [...backfilledResources, ...newEntries],
  };
  await writeJsonBlob("curated", "created-resources.json", report);
  return report;
}
