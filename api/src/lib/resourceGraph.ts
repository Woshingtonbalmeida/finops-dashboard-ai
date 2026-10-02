import { DefaultAzureCredential } from "@azure/identity";

const credential = new DefaultAzureCredential();

async function getManagementToken(): Promise<string> {
  const token = await credential.getToken("https://management.azure.com/.default");
  if (!token) throw new Error("Não foi possível obter token de acesso para management.azure.com");
  return token.token;
}

interface ResourceGraphResponse<T> {
  data: T[];
  $skipToken?: string;
}

// Azure Resource Graph caps a single response at 1000 rows — both subscriptions together
// hold 1500+ resources, so every query here has to page through with $skipToken until the
// API stops returning one.
export async function queryResourceGraphAll<T>(subscriptionIds: string[], query: string): Promise<T[]> {
  const token = await getManagementToken();
  const rows: T[] = [];
  let skipToken: string | undefined;

  do {
    const response = await fetch("https://management.azure.com/providers/Microsoft.ResourceGraph/resources?api-version=2022-10-01", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        subscriptions: subscriptionIds,
        query,
        options: skipToken ? { $top: 1000, $skipToken: skipToken } : { $top: 1000 },
      }),
    });
    if (!response.ok) {
      throw new Error(`Resource Graph -> ${response.status} ${await response.text()}`);
    }
    const data = (await response.json()) as ResourceGraphResponse<T>;
    rows.push(...(data.data ?? []));
    skipToken = data.$skipToken;
  } while (skipToken);

  return rows;
}

// AKS node resource groups (MC_*) and Databricks-managed resource groups (databricks-rg-*)
// hold auto-managed infrastructure that scales in and out constantly. Whether that belongs
// in a given view depends on the question being asked — "what did someone create this week"
// wants it gone, "what do we actually have" wants it counted — so the filter lives here and
// each caller decides.
export const EXCLUDE_MANAGED_RG_FILTER = `where not(tolower(resourceGroup) startswith "mc_") and not(tolower(resourceGroup) startswith "databricks-rg")`;

export function isManagedResourceGroup(resourceGroup: string): boolean {
  const lower = resourceGroup.toLowerCase();
  return lower.startsWith("mc_") || lower.startsWith("databricks-rg");
}
