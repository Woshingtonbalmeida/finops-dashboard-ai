import { subscriptionIds } from "../config/client";
import { DefaultAzureCredential } from "@azure/identity";
import { writeJsonBlob } from "./storage";

export interface BudgetStatus {
  subscriptionId: string;
  budgetName: string;
  amount: number;
  currentSpend: number;
  timeGrain: string;
  currency: string;
}

export interface BudgetsReport {
  generatedAt: string;
  budgets: BudgetStatus[];
}

const credential = new DefaultAzureCredential();

async function getManagementToken(): Promise<string> {
  const token = await credential.getToken("https://management.azure.com/.default");
  if (!token) throw new Error("Não foi possível obter token de acesso para management.azure.com");
  return token.token;
}

interface AzureBudgetListResponse {
  value: {
    name: string;
    properties: {
      amount: number;
      timeGrain: string;
      currentSpend?: { amount: number; unit: string };
    };
  }[];
}

export async function fetchBudgetsForSubscription(subscriptionId: string): Promise<BudgetStatus[]> {
  const token = await getManagementToken();
  const url = `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.Consumption/budgets?api-version=2023-11-01`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    throw new Error(`Falha ao consultar budgets de ${subscriptionId}: ${response.status} ${await response.text()}`);
  }
  const data = (await response.json()) as AzureBudgetListResponse;
  return data.value.map((b) => ({
    subscriptionId,
    budgetName: b.name,
    amount: b.properties.amount,
    currentSpend: b.properties.currentSpend?.amount ?? 0,
    timeGrain: b.properties.timeGrain,
    currency: b.properties.currentSpend?.unit ?? "USD",
  }));
}



// Shared by the daily timer and the on-demand HTTP refresh — Azure Budgets has no
// "run now" API like Cost Management exports do, so this is the only way to pick up
// a newly created/edited budget before the next scheduled 06:00 UTC run.
export async function refreshBudgetsNow(onWarn?: (message: string) => void): Promise<BudgetsReport> {
  const budgets: BudgetStatus[] = [];
  for (const subscriptionId of subscriptionIds()) {
    try {
      budgets.push(...(await fetchBudgetsForSubscription(subscriptionId)));
    } catch (err) {
      onWarn?.(`Falha ao buscar budgets de ${subscriptionId}: ${(err as Error).message}`);
    }
  }
  const report: BudgetsReport = { generatedAt: new Date().toISOString(), budgets };
  await writeJsonBlob("curated", "budgets.json", report);
  return report;
}
