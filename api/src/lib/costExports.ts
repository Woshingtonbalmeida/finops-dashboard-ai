import { DefaultAzureCredential } from "@azure/identity";

const credential = new DefaultAzureCredential();

async function getManagementToken(): Promise<string> {
  const token = await credential.getToken("https://management.azure.com/.default");
  if (!token) throw new Error("Não foi possível obter token de acesso para management.azure.com");
  return token.token;
}

const EXPORT_NAME = "finops-export-daily";

// Azure's own native export schedule picks an arbitrary time of day we can't control
// (it landed at 19:00 UTC for one subscription and 02:00 UTC for the other, despite
// identical config). This forces a run at a time we choose, ahead of the other daily
// refresh timers, so ingestion has finished before anyone checks the dashboard.
export async function triggerExportRun(subscriptionId: string): Promise<void> {
  const token = await getManagementToken();
  const response = await fetch(
    `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.CostManagement/exports/${EXPORT_NAME}/run?api-version=2025-03-01`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` } }
  );
  if (!response.ok) {
    throw new Error(`Falha ao disparar export de ${subscriptionId}: ${response.status} ${await response.text()}`);
  }
}
