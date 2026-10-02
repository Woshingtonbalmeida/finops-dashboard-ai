import { DefaultAzureCredential } from "@azure/identity";
import { costByResourceId } from "./resourceCost";

const credential = new DefaultAzureCredential();

async function getManagementToken(): Promise<string> {
  const token = await credential.getToken("https://management.azure.com/.default");
  if (!token) throw new Error("Não foi possível obter token de acesso para management.azure.com");
  return token.token;
}

// Engineers mark a resource for cleanup by tagging it AÇÃO=DELETAR directly (Azure
// doesn't auto-propagate resource-group tags onto child resources, so this must be
// applied per-resource, which is also what makes per-resource cost tracking possible).
const ACTION_TAG_KEY = "AÇÃO";
const ACTION_TAG_VALUE = "DELETAR";

export interface DeletionCandidate {
  resourceId: string;
  name: string;
  type: string;
  subscriptionId: string;
  resourceGroup: string;
  location: string;
  owner: string;
  produto: string;
  mtdCost: number;
  currency: string;
}

interface ResourceRow {
  id: string;
  name: string;
  type: string;
  subscriptionId: string;
  resourceGroup: string;
  location: string;
  tags: Record<string, string> | null;
}

interface ResourceGraphResponse {
  data: ResourceRow[];
}

export async function fetchDeletionCandidates(subscriptionIds: string[]): Promise<DeletionCandidate[]> {
  const query = `
Resources
| where tags['${ACTION_TAG_KEY}'] =~ '${ACTION_TAG_VALUE}'
| project id, name, type, subscriptionId, resourceGroup, location, tags
`.trim();

  const token = await getManagementToken();
  const response = await fetch("https://management.azure.com/providers/Microsoft.ResourceGraph/resources?api-version=2022-10-01", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ subscriptions: subscriptionIds, query }),
  });
  if (!response.ok) {
    throw new Error(`Resource Graph -> ${response.status} ${await response.text()}`);
  }
  const data = (await response.json()) as ResourceGraphResponse;
  const resources = data.data ?? [];
  if (resources.length === 0) return [];

  const relevantIds = new Set(resources.map((r) => r.id.toLowerCase()));
  const { costs, currency } = await costByResourceId(relevantIds);

  return resources
    .map((r) => ({
      resourceId: r.id,
      name: r.name,
      type: r.type,
      subscriptionId: r.subscriptionId,
      resourceGroup: r.resourceGroup,
      location: r.location,
      owner: r.tags?.OWNER ?? "",
      produto: r.tags?.PRODUTO ?? "",
      mtdCost: Math.round((costs.get(r.id.toLowerCase()) ?? 0) * 100) / 100,
      currency,
    }))
    .sort((a, b) => b.mtdCost - a.mtdCost);
}
