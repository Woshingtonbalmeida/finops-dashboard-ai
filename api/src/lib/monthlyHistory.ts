import { subscriptionIds } from "../config/client";
import { DefaultAzureCredential } from "@azure/identity";
import { readJsonBlob, writeJsonBlob } from "./storage";
import { CuratedSummary } from "./focus";

const credential = new DefaultAzureCredential();

async function getManagementToken(): Promise<string> {
  const token = await credential.getToken("https://management.azure.com/.default");
  if (!token) throw new Error("Não foi possível obter token de acesso para management.azure.com");
  return token.token;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface MonthlyHistoryEntry {
  yearMonth: string; // "2026-01"
  subscriptionId: string;
  subscriptionName: string;
  cost: number;
  currency: string;
}

interface QueryApiResponse {
  properties: {
    rows: [number, string, string][]; // [Cost, BillingMonth, Currency]
  };
}

export interface MonthlyServiceCost {
  yearMonth: string; // "2026-01"
  subscriptionId: string;
  subscriptionName: string;
  service: string;
  cost: number;
  currency: string;
}

interface QueryApiGroupedResponse {
  properties: {
    columns: { name: string }[];
    rows: (number | string)[][];
  };
}

// Independent of the FOCUS export pipeline (which only has raw CSVs since the exports
// were created, i.e. May 2026 onward) — Cost Management's own Query API keeps ~13 months
// of usage history regardless of when an export was set up, so this is the only way to
// show cost from earlier in the year.
async function fetchMonthlyHistoryForSubscription(subscriptionId: string, subscriptionName: string): Promise<MonthlyHistoryEntry[]> {
  const token = await getManagementToken();
  const from = `${new Date().getUTCFullYear()}-01-01T00:00:00Z`;
  const to = new Date().toISOString();
  const body = JSON.stringify({
    type: "ActualCost",
    timeframe: "Custom",
    timePeriod: { from, to },
    dataset: {
      granularity: "Monthly",
      aggregation: { totalCost: { name: "Cost", function: "Sum" } },
    },
  });
  const url = `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.CostManagement/query?api-version=2023-11-01`;

  let response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body,
  });
  if (response.status === 429) {
    const retryAfterSeconds = Number(response.headers.get("Retry-After")) || 5;
    await sleep(retryAfterSeconds * 1000);
    response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body,
    });
  }
  if (!response.ok) {
    throw new Error(`Query API para ${subscriptionId} -> ${response.status} ${await response.text()}`);
  }
  const data = (await response.json()) as QueryApiResponse;
  return (data.properties.rows ?? []).map(([cost, billingMonth, currency]) => ({
    yearMonth: billingMonth.slice(0, 7),
    subscriptionId,
    subscriptionName,
    cost: Math.round(cost * 100) / 100,
    currency,
  }));
}

export interface MonthlyResourceGroupCost {
  yearMonth: string; // "2026-01"
  subscriptionId: string;
  subscriptionName: string;
  resourceGroup: string;
  cost: number;
  currency: string;
}

interface MonthlyGroupedCost {
  yearMonth: string;
  key: string;
  cost: number;
  currency: string;
}

// Same data source as fetchMonthlyHistoryForSubscription, grouped by one dimension instead
// of left ungrouped — feeds both the by-service breakdown table and the month-over-month
// variance analysis, which needs the same shape for ServiceName and ResourceGroupName.
async function fetchMonthlyGroupedHistoryForSubscription(
  subscriptionId: string,
  dimension: "ServiceName" | "ResourceGroupName",
  label: string
): Promise<MonthlyGroupedCost[]> {
  const token = await getManagementToken();
  const from = `${new Date().getUTCFullYear()}-01-01T00:00:00Z`;
  const to = new Date().toISOString();
  const body = JSON.stringify({
    type: "ActualCost",
    timeframe: "Custom",
    timePeriod: { from, to },
    dataset: {
      granularity: "Monthly",
      aggregation: { totalCost: { name: "Cost", function: "Sum" } },
      grouping: [{ type: "Dimension", name: dimension }],
    },
  });
  const url = `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.CostManagement/query?api-version=2023-11-01`;

  let response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body,
  });
  if (response.status === 429) {
    const retryAfterSeconds = Number(response.headers.get("Retry-After")) || 5;
    await sleep(retryAfterSeconds * 1000);
    response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body,
    });
  }
  if (!response.ok) {
    throw new Error(`Query API (${label}) para ${subscriptionId} -> ${response.status} ${await response.text()}`);
  }
  const data = (await response.json()) as QueryApiGroupedResponse;
  const columns = data.properties.columns.map((c) => c.name);
  const costIdx = columns.indexOf("Cost");
  const keyIdx = columns.indexOf(dimension);
  const monthIdx = columns.indexOf("BillingMonth");
  const currencyIdx = columns.indexOf("Currency");
  return (data.properties.rows ?? []).map((row) => ({
    yearMonth: String(row[monthIdx]).slice(0, 7),
    key: String(row[keyIdx]),
    cost: Math.round(Number(row[costIdx]) * 100) / 100,
    currency: String(row[currencyIdx]),
  }));
}

export interface MonthlyHistoryReport {
  generatedAt: string;
  entries: MonthlyHistoryEntry[];
  byService: MonthlyServiceCost[];
  // Added after the by-service breakdown; blobs written before this field exists read as
  // undefined, so consumers must tolerate its absence until the next refresh.
  byResourceGroup?: MonthlyResourceGroupCost[];
}



// Shared by the daily timer and the on-demand HTTP refresh — same throttle risk as
// the Forecast API (observed 429s on this same family of Cost Management endpoints).
//
// Both entries and byService carry subscriptionId per row, so a fetch failure for just
// ONE subscription is recovered surgically: that subscription's rows are substituted from
// the last known-good blob while the other subscription's freshly-fetched rows are kept —
// instead of a full-blob fallback (or, worse, silently persisting a partial result missing
// one subscription entirely, which is what happened before this was per-subscription).
export async function refreshMonthlyHistoryNow(onWarn?: (message: string) => void): Promise<MonthlyHistoryReport> {
  const summary = await readJsonBlob<CuratedSummary>("curated", "summary.json");
  const subscriptionName = (id: string) => summary?.bySubscription.find((s) => s.subscriptionId === id)?.subscriptionName ?? id;
  const previous = await readJsonBlob<MonthlyHistoryReport>("curated", "monthly-history.json");

  const entries: MonthlyHistoryEntry[] = [];
  const byService: MonthlyServiceCost[] = [];
  const byResourceGroup: MonthlyResourceGroupCost[] = [];

  for (const subscriptionId of subscriptionIds()) {
    const name = subscriptionName(subscriptionId);

    try {
      entries.push(...(await fetchMonthlyHistoryForSubscription(subscriptionId, name)));
    } catch (err) {
      onWarn?.(`Falha ao buscar histórico mensal de ${name}: ${(err as Error).message}`);
      const fallback = previous?.entries.filter((e) => e.subscriptionId === subscriptionId) ?? [];
      if (fallback.length > 0) {
        onWarn?.(`Histórico mensal de ${name}: mantendo o último valor conhecido.`);
        entries.push(...fallback);
      }
    }

    try {
      const rows = await fetchMonthlyGroupedHistoryForSubscription(subscriptionId, "ServiceName", "por serviço");
      byService.push(...rows.map(({ key, ...rest }) => ({ ...rest, subscriptionId, subscriptionName: name, service: key })));
    } catch (err) {
      onWarn?.(`Falha ao buscar histórico mensal por serviço de ${name}: ${(err as Error).message}`);
      const fallback = previous?.byService.filter((e) => e.subscriptionId === subscriptionId) ?? [];
      if (fallback.length > 0) {
        onWarn?.(`Histórico mensal por serviço de ${name}: mantendo o último valor conhecido.`);
        byService.push(...fallback);
      }
    }

    try {
      const rows = await fetchMonthlyGroupedHistoryForSubscription(subscriptionId, "ResourceGroupName", "por grupo de recursos");
      byResourceGroup.push(...rows.map(({ key, ...rest }) => ({ ...rest, subscriptionId, subscriptionName: name, resourceGroup: key })));
    } catch (err) {
      onWarn?.(`Falha ao buscar histórico mensal por grupo de recursos de ${name}: ${(err as Error).message}`);
      const fallback = previous?.byResourceGroup?.filter((e) => e.subscriptionId === subscriptionId) ?? [];
      if (fallback.length > 0) {
        onWarn?.(`Histórico mensal por grupo de recursos de ${name}: mantendo o último valor conhecido.`);
        byResourceGroup.push(...fallback);
      }
    }
  }

  const report: MonthlyHistoryReport = { generatedAt: new Date().toISOString(), entries, byService, byResourceGroup };
  await writeJsonBlob("curated", "monthly-history.json", report);
  return report;
}
