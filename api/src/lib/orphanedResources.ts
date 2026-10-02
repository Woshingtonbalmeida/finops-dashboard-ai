import { DefaultAzureCredential } from "@azure/identity";
import { costByResourceId } from "./resourceCost";

const credential = new DefaultAzureCredential();

async function getManagementToken(): Promise<string> {
  const token = await credential.getToken("https://management.azure.com/.default");
  if (!token) throw new Error("Não foi possível obter token de acesso para management.azure.com");
  return token.token;
}

export interface OrphanedResource {
  resourceId: string;
  name: string;
  type: string;
  subscriptionId: string;
  resourceGroup: string;
  location: string;
  sku: string;
  mtdCost: number;
  currency: string;
}

interface ResourceGraphRow {
  id: string;
  name: string;
  type: string;
  subscriptionId: string;
  resourceGroup: string;
  location: string;
  sku: string | null;
}

interface ResourceGraphResponse {
  data: ResourceGraphRow[];
}

// Candidates for "not connected to anything, still billing": unattached managed disks,
// public IPs with no ipConfiguration, and NICs with neither a VM nor a private endpoint.
const ORPHAN_QUERY = `
Resources
| where (type =~ 'microsoft.compute/disks' and (isnull(managedBy) or managedBy == ''))
   or (type =~ 'microsoft.network/publicipaddresses' and isnull(properties.ipConfiguration))
   or (type =~ 'microsoft.network/networkinterfaces' and isnull(properties.virtualMachine) and isnull(properties.privateEndpoint))
| project id, name, type, subscriptionId, resourceGroup, location, sku = sku.name
`.trim();

async function fetchOrphanCandidates(subscriptionIds: string[]): Promise<ResourceGraphRow[]> {
  const token = await getManagementToken();
  const response = await fetch("https://management.azure.com/providers/Microsoft.ResourceGraph/resources?api-version=2022-10-01", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ subscriptions: subscriptionIds, query: ORPHAN_QUERY }),
  });
  if (!response.ok) {
    throw new Error(`Resource Graph -> ${response.status} ${await response.text()}`);
  }
  const data = (await response.json()) as ResourceGraphResponse;
  return data.data ?? [];
}

export async function fetchOrphanedResources(subscriptionIds: string[]): Promise<OrphanedResource[]> {
  const candidates = await fetchOrphanCandidates(subscriptionIds);
  const idSet = new Set(candidates.map((c) => c.id.toLowerCase()));
  const { costs, currency } = await costByResourceId(idSet);

  return candidates
    .map((c) => ({
      resourceId: c.id,
      name: c.name,
      type: c.type,
      subscriptionId: c.subscriptionId,
      resourceGroup: c.resourceGroup,
      location: c.location,
      sku: c.sku ?? "",
      mtdCost: Math.round((costs.get(c.id.toLowerCase()) ?? 0) * 100) / 100,
      currency,
    }))
    .sort((a, b) => b.mtdCost - a.mtdCost);
}
