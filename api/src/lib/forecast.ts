import { subscriptionIds } from "../config/client";
import { DefaultAzureCredential } from "@azure/identity";
import { readJsonBlob, writeJsonBlob } from "./storage";

const credential = new DefaultAzureCredential();

async function getManagementToken(): Promise<string> {
  const token = await credential.getToken("https://management.azure.com/.default");
  if (!token) throw new Error("Não foi possível obter token de acesso para management.azure.com");
  return token.token;
}

export interface SubscriptionForecast {
  subscriptionId: string;
  forecastAmount: number;
  currency: string;
}

interface ForecastApiResponse {
  properties: {
    columns: { name: string; type: string }[];
    rows: [number, number, string, string][]; // [Cost, UsageDate, CostStatus, Currency]
  };
}

function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59));
  return { from: from.toISOString(), to: to.toISOString() };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Sums actual cost so far this month plus Azure's own daily forecast for the
// remaining days, matching what Cost Management's "Forecast" tile shows in the portal.
//
// The Forecast API throttles aggressively — calling it for both subscriptions back to
// back has been observed to 429 on both in production. One retry with a short delay is
// enough in practice; this isn't meant to survive a sustained outage, just a throttle blip.
export async function fetchForecastForSubscription(subscriptionId: string): Promise<SubscriptionForecast> {
  const { from, to } = currentMonthRange();
  const token = await getManagementToken();
  const body = JSON.stringify({
    type: "ActualCost",
    timeframe: "Custom",
    timePeriod: { from, to },
    dataset: {
      granularity: "Daily",
      aggregation: { totalCost: { name: "Cost", function: "Sum" } },
    },
    includeActualCost: true,
    includeFreshPartialCost: false,
  });
  const url = `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.CostManagement/forecast?api-version=2023-11-01`;

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
    throw new Error(`Forecast API para ${subscriptionId} -> ${response.status} ${await response.text()}`);
  }
  const data = (await response.json()) as ForecastApiResponse;
  const rows = data.properties.rows ?? [];
  const forecastAmount = rows.reduce((sum, row) => sum + row[0], 0);
  const currency = rows[0]?.[3] ?? "BRL";
  return { subscriptionId, forecastAmount, currency };
}

export interface ForecastReport {
  generatedAt: string;
  bySubscription: SubscriptionForecast[];
}



// Shared by the daily timer and the on-demand HTTP refresh.
export async function refreshForecastNow(onWarn?: (message: string) => void): Promise<ForecastReport> {
  const bySubscription: SubscriptionForecast[] = [];
  for (const subscriptionId of subscriptionIds()) {
    try {
      bySubscription.push(await fetchForecastForSubscription(subscriptionId));
    } catch (err) {
      onWarn?.(`Falha ao buscar forecast de ${subscriptionId}: ${(err as Error).message}`);
    }
  }

  // The Forecast API throttles the whole request, not just one subscription — if every
  // call failed, keep yesterday's numbers instead of blanking the dashboard to R$ 0,00,
  // which reads as "there's no forecast" rather than "we couldn't fetch it right now".
  if (bySubscription.length === 0) {
    const previous = await readJsonBlob<ForecastReport>("curated", "forecast.json");
    if (previous && previous.bySubscription.length > 0) {
      onWarn?.("Forecast: todas as chamadas falharam, mantendo o último valor conhecido.");
      return previous;
    }
  }

  const report: ForecastReport = { generatedAt: new Date().toISOString(), bySubscription };
  await writeJsonBlob("curated", "forecast.json", report);
  return report;
}
