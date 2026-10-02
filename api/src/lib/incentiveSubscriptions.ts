import { readJsonBlob, writeJsonBlob } from "./storage";

// Sponsorship-type ("Web Direct Offer") subscriptions don't expose usage through either
// Cost Management Query or the legacy Consumption usageDetails API — confirmed empty on
// both for a real one, despite the resource inventory (via Resource Graph) showing real
// workloads. Microsoft's own sponsorship portal (microsoftazuresponsorships.com) appears
// to be a separate system with no public API, so these figures are entered by hand instead
// of being pulled automatically like every other number in this app.
export interface IncentiveSubscription {
  subscriptionId: string;
  subscriptionName: string;
  offerName: string;
  totalCredit: number;
  usedCost: number;
  currency: string;
  startDate: string; // ISO date, e.g. "2026-05-25"
  expiresOn: string; // ISO date, e.g. "2027-05-01"
}

export interface IncentiveSubscriptionsReport {
  updatedAt: string;
  subscriptions: IncentiveSubscription[];
}

const CURATED_CONTAINER = "curated";
const BLOB_NAME = "incentive-subscriptions.json";

export async function readIncentiveSubscriptions(): Promise<IncentiveSubscriptionsReport> {
  const existing = await readJsonBlob<IncentiveSubscriptionsReport>(CURATED_CONTAINER, BLOB_NAME);
  return existing ?? { updatedAt: new Date().toISOString(), subscriptions: [] };
}

function isValidEntry(value: unknown): value is IncentiveSubscription {
  if (typeof value !== "object" || value === null) return false;
  const t = value as Record<string, unknown>;
  return (
    typeof t.subscriptionId === "string" &&
    t.subscriptionId.length > 0 &&
    typeof t.subscriptionName === "string" &&
    typeof t.offerName === "string" &&
    typeof t.totalCredit === "number" &&
    typeof t.usedCost === "number" &&
    typeof t.currency === "string" &&
    typeof t.startDate === "string" &&
    typeof t.expiresOn === "string"
  );
}

export async function writeIncentiveSubscriptions(subscriptions: unknown): Promise<IncentiveSubscriptionsReport> {
  if (!Array.isArray(subscriptions) || !subscriptions.every(isValidEntry)) {
    throw new Error(
      "Payload inválido: esperado { subscriptions: [{ subscriptionId, subscriptionName, offerName, totalCredit, usedCost, currency, startDate, expiresOn }] }",
    );
  }
  const report: IncentiveSubscriptionsReport = { updatedAt: new Date().toISOString(), subscriptions };
  await writeJsonBlob(CURATED_CONTAINER, BLOB_NAME, report);
  return report;
}
