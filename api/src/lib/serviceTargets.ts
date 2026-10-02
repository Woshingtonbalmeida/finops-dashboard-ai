import { readJsonBlob, writeJsonBlob } from "./storage";

// subscriptionId is "all" for the target shown on the combined ("Todas as subscriptions")
// view, or a real subscription GUID for a target scoped to a single subscription.
export interface ServiceTarget {
  subscriptionId: string;
  service: string;
  targetAmount: number;
  currency: string;
}

export interface ServiceTargetsReport {
  updatedAt: string;
  targets: ServiceTarget[];
}

const CURATED_CONTAINER = "curated";
const BLOB_NAME = "service-targets.json";

export async function readServiceTargets(): Promise<ServiceTargetsReport> {
  const existing = await readJsonBlob<ServiceTargetsReport>(CURATED_CONTAINER, BLOB_NAME);
  return existing ?? { updatedAt: new Date().toISOString(), targets: [] };
}

function isValidTarget(value: unknown): value is ServiceTarget {
  if (typeof value !== "object" || value === null) return false;
  const t = value as Record<string, unknown>;
  return (
    typeof t.subscriptionId === "string" &&
    t.subscriptionId.length > 0 &&
    typeof t.service === "string" &&
    t.service.length > 0 &&
    typeof t.targetAmount === "number" &&
    typeof t.currency === "string"
  );
}

export async function writeServiceTargets(targets: unknown): Promise<ServiceTargetsReport> {
  if (!Array.isArray(targets) || !targets.every(isValidTarget)) {
    throw new Error("Payload inválido: esperado { targets: [{ subscriptionId, service, targetAmount, currency }] }");
  }
  const report: ServiceTargetsReport = { updatedAt: new Date().toISOString(), targets };
  await writeJsonBlob(CURATED_CONTAINER, BLOB_NAME, report);
  return report;
}
