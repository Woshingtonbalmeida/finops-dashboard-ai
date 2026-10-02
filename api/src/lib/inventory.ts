import { subscriptionIds } from "../config/client";
import { readJsonBlob, writeJsonBlob } from "./storage";
import { CuratedSummary } from "./focus";
import { costByResourceId } from "./resourceCost";
import { isManagedResourceGroup, queryResourceGraphAll } from "./resourceGraph";


const CURATED_CONTAINER = "curated";
const BLOB_NAME = "inventory.json";

export interface InventoryRow {
  id: string;
  name: string;
  type: string;
  kind: string | null;
  /** Projected as skuName by INVENTORY_QUERY — "sku" is already an object column in
   *  Resource Graph, so the flattened string needs its own name. */
  skuName: string | null;
  location: string;
  resourceGroup: string;
  subscriptionId: string;
  tagCount: number;
}

// Unlike the "Recurso criado" page, managed resource groups (MC_*, databricks-rg-*) are NOT
// filtered out here: the question this page answers is "what do we actually have", and an
// AKS node pool's VMs and disks are real resources that cost real money. They're flagged
// instead, so the UI can separate "infrastructure someone provisioned" from "infrastructure
// Azure manages on our behalf" without hiding either.
const INVENTORY_QUERY = `
Resources
| extend skuName = tostring(sku.name)
| project id, name, type, kind, skuName, location, resourceGroup, subscriptionId, tagCount = array_length(bag_keys(tags))
`.trim();

export interface InventoryResource {
  resourceId: string;
  name: string;
  type: string;
  /** Last segment of the ARM type, e.g. "virtualmachines" — lower-cased by Resource Graph. */
  shortType: string;
  /** Portal-style name for shortType when known, otherwise shortType itself. */
  friendlyType: string;
  provider: string;
  kind: string | null;
  sku: string | null;
  location: string;
  resourceGroup: string;
  subscriptionId: string;
  subscriptionName: string;
  managed: boolean;
  tagged: boolean;
  /** Month-to-date cost, or null when this resource has no cost rows (free tier, or no usage
   *  yet this month) — distinct from 0, which would claim we know it cost nothing. */
  mtdCost: number | null;
}

export interface InventoryBreakdown {
  key: string;
  count: number;
  cost: number;
}

export interface InventoryReport {
  generatedAt: string;
  currency: string;
  totalResources: number;
  totalManaged: number;
  totalUntagged: number;
  totalWithoutCost: number;
  distinctTypes: number;
  distinctResourceGroups: number;
  distinctLocations: number;
  byType: InventoryBreakdown[];
  byProvider: InventoryBreakdown[];
  byResourceGroup: InventoryBreakdown[];
  byLocation: InventoryBreakdown[];
  bySubscription: InventoryBreakdown[];
  resources: InventoryResource[];
}

// Resource Graph lower-cases every type, so "storageaccounts" and "serverfarms" is what
// comes back — unreadable in a table someone is scanning for "how many App Service Plans do
// we have". These are the types actually present in the monitored subscriptions, mapped to
// the name the portal uses; anything unmapped falls back to the raw short type rather than
// guessing, so a new resource type shows up as itself instead of being mislabelled.
const FRIENDLY_TYPE: Record<string, string> = {
  sites: "App Service / Function App",
  serverfarms: "App Service Plan",
  storageaccounts: "Storage Account",
  certificates: "Certificado",
  publicipaddresses: "IP Público",
  databases: "SQL Database",
  servers: "SQL Server",
  virtualmachines: "Máquina Virtual",
  disks: "Disco Gerenciado",
  networkinterfaces: "Interface de Rede",
  networksecuritygroups: "Network Security Group",
  virtualnetworks: "Rede Virtual",
  loadbalancers: "Load Balancer",
  managedclusters: "AKS Cluster",
  registries: "Container Registry",
  vaults: "Key Vault / Recovery Vault",
  workspaces: "Workspace",
  components: "Application Insights",
  accounts: "Conta de Serviço de IA",
  namespaces: "Namespace",
  smartdetectoralertrules: "Regra de Alerta (Smart Detector)",
  actiongroups: "Grupo de Ação",
  metricalerts: "Alerta de Métrica",
  scheduledqueryrules: "Alerta de Consulta Agendada",
  privateendpoints: "Private Endpoint",
  privatednszones: "Zona DNS Privada",
  dnszones: "Zona DNS",
  networkwatchers: "Network Watcher",
  applicationgateways: "Application Gateway",
  bastionhosts: "Bastion",
  natgateways: "NAT Gateway",
  routetables: "Tabela de Rotas",
  containerapps: "Container App",
  staticsites: "Static Web App",
  flexibleservers: "Servidor Flexível (PostgreSQL/MySQL)",
  redis: "Cache for Redis",
  searchservices: "Cognitive Search",
  datafactories: "Data Factory",
  snapshots: "Snapshot",
  images: "Imagem",
  sshpublickeys: "Chave SSH Pública",
  solutions: "Solução do Log Analytics",
  dataconnectors: "Conector de Dados",
  restorepointcollections: "Coleção de Pontos de Restauração",
  prometheusrulegroups: "Grupo de Regras Prometheus",
  connections: "Conexão de API",
  userassignedidentities: "Managed Identity",
  runbooks: "Runbook",
  virtualnetworklinks: "Link de Rede Virtual",
  virtualmachinescalesets: "VM Scale Set",
  workflows: "Logic App",
  configurationstores: "App Configuration",
  projects: "Projeto (Foundry / Migrate)",
  datacollectionrules: "Regra de Coleta de Dados",
  datacollectionendpoints: "Endpoint de Coleta de Dados",
  dashboards: "Dashboard do Portal",
  databaseaccounts: "Cosmos DB",
  factories: "Data Factory",
  grafana: "Managed Grafana",
  accessconnectors: "Access Connector (Databricks)",
  communicationservices: "Communication Services",
  emailservices: "Email Communication Services",
  domains: "Domínio",
  webtests: "Teste de Disponibilidade",
  botservices: "Bot Service",
  profiles: "Perfil de CDN / Front Door",
  automationaccounts: "Automation Account",
  afdendpoints: "Endpoint do Front Door",
};

// "microsoft.compute/virtualmachines" -> provider "Compute", short type "virtualMachines".
// Resource Graph lower-cases the type, so the readable casing has to come from somewhere —
// the raw type is kept alongside for anyone who needs the exact ARM string.
function splitType(type: string): { provider: string; shortType: string } {
  const [namespace, ...rest] = type.split("/");
  const provider = namespace.replace(/^microsoft\./i, "");
  return {
    provider: provider.charAt(0).toUpperCase() + provider.slice(1),
    shortType: rest.length > 0 ? rest[rest.length - 1] : type,
  };
}

function tally(
  resources: InventoryResource[],
  keyOf: (r: InventoryResource) => string
): InventoryBreakdown[] {
  const map = new Map<string, InventoryBreakdown>();
  for (const resource of resources) {
    const key = keyOf(resource);
    const entry = map.get(key) ?? { key, count: 0, cost: 0 };
    entry.count += 1;
    entry.cost += resource.mtdCost ?? 0;
    map.set(key, entry);
  }
  return [...map.values()]
    .map((e) => ({ ...e, cost: Math.round(e.cost * 100) / 100 }))
    .sort((a, b) => b.count - a.count || b.cost - a.cost);
}

// Split from refreshInventoryNow so the shaping rules can run without Azure behind them —
// the local dev server builds its fixture through this exact function rather than a copy.
export function buildInventoryReport(
  rows: InventoryRow[],
  subscriptionName: (id: string) => string,
  costs: Map<string, number>,
  currency: string
): InventoryReport {
  const resources: InventoryResource[] = rows.map((row) => {
    const { provider, shortType } = splitType(row.type);
    const friendlyType = FRIENDLY_TYPE[shortType] ?? shortType;
    const cost = costs.get(row.id.toLowerCase());
    return {
      resourceId: row.id,
      name: row.name,
      type: row.type,
      shortType,
      friendlyType,
      provider,
      kind: row.kind || null,
      sku: row.skuName || null,
      location: row.location,
      resourceGroup: row.resourceGroup,
      subscriptionId: row.subscriptionId,
      subscriptionName: subscriptionName(row.subscriptionId),
      managed: isManagedResourceGroup(row.resourceGroup),
      tagged: (row.tagCount ?? 0) > 0,
      mtdCost: cost === undefined ? null : Math.round(cost * 100) / 100,
    };
  });

  resources.sort((a, b) => (b.mtdCost ?? 0) - (a.mtdCost ?? 0) || a.name.localeCompare(b.name));

  const report: InventoryReport = {
    generatedAt: new Date().toISOString(),
    currency,
    totalResources: resources.length,
    totalManaged: resources.filter((r) => r.managed).length,
    totalUntagged: resources.filter((r) => !r.tagged).length,
    totalWithoutCost: resources.filter((r) => r.mtdCost === null).length,
    distinctTypes: new Set(resources.map((r) => r.type)).size,
    distinctResourceGroups: new Set(resources.map((r) => `${r.subscriptionId}/${r.resourceGroup}`)).size,
    distinctLocations: new Set(resources.map((r) => r.location)).size,
    byType: tally(resources, (r) => r.friendlyType),
    byProvider: tally(resources, (r) => r.provider),
    byResourceGroup: tally(resources, (r) => r.resourceGroup),
    byLocation: tally(resources, (r) => r.location),
    bySubscription: tally(resources, (r) => r.subscriptionName),
    resources,
  };

  return report;
}

export async function refreshInventoryNow(onWarn?: (message: string) => void): Promise<InventoryReport> {
  const summary = await readJsonBlob<CuratedSummary>(CURATED_CONTAINER, "summary.json");
  const subscriptionName = (id: string) =>
    summary?.bySubscription.find((s) => s.subscriptionId === id)?.subscriptionName ?? id;

  const rows = await queryResourceGraphAll<InventoryRow>(subscriptionIds(), INVENTORY_QUERY);

  // One CSV scan for every resource at once, the same way the deletion candidates page
  // prices its list — not one lookup per resource.
  let costs = new Map<string, number>();
  let currency = summary?.currency ?? "BRL";
  try {
    const result = await costByResourceId(new Set(rows.map((r) => r.id.toLowerCase())));
    costs = result.costs;
    currency = result.currency;
  } catch (err) {
    // The inventory itself is still worth publishing without cost — losing the whole page
    // because the CSVs were unreadable would be worse than showing counts with no prices.
    onWarn?.(`Falha ao cruzar custo por recurso: ${(err as Error).message}`);
  }

  const report = buildInventoryReport(rows, subscriptionName, costs, currency);
  await writeJsonBlob(CURATED_CONTAINER, BLOB_NAME, report);
  return report;
}
