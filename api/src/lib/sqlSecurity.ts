import { DefaultAzureCredential } from "@azure/identity";

const credential = new DefaultAzureCredential();

async function getManagementToken(): Promise<string> {
  const token = await credential.getToken("https://management.azure.com/.default");
  if (!token) throw new Error("Não foi possível obter token de acesso para management.azure.com");
  return token.token;
}

interface ResourceGraphResponse<T> {
  data: T[];
}

async function queryResourceGraph<T>(subscriptionIds: string[], query: string): Promise<T[]> {
  const token = await getManagementToken();
  const response = await fetch("https://management.azure.com/providers/Microsoft.ResourceGraph/resources?api-version=2022-10-01", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ subscriptions: subscriptionIds, query }),
  });
  if (!response.ok) {
    throw new Error(`Resource Graph -> ${response.status} ${await response.text()}`);
  }
  const data = (await response.json()) as ResourceGraphResponse<T>;
  return data.data ?? [];
}

export interface SqlServerInfo {
  name: string;
  subscriptionId: string;
  resourceGroup: string;
  location: string;
  publicNetworkAccess: string; // "Enabled" | "Disabled"
  minimalTlsVersion: string; // "1.0" | "1.1" | "1.2" | "" (not set — platform default, currently 1.2)
  fqdn: string;
}

export interface SqlDatabaseInfo {
  name: string;
  serverName: string;
  subscriptionId: string;
  resourceGroup: string;
  location: string;
  status: string;
  zoneRedundant: boolean;
  skuName: string;
  skuTier: string;
  skuCapacity: number | null;
  // DTU model: min/max DTUs. vCore model: min/max vCores (serverless) or fixed vCores.
  // Same underlying ARM fields either way — the label just depends on skuTier/skuName.
  minCapacity: number | null;
  maxSizeGB: number | null;
}

export interface SqlSecurityReport {
  generatedAt: string;
  servers: SqlServerInfo[];
  databases: SqlDatabaseInfo[];
}

const SQL_SERVERS_QUERY = `
Resources
| where type =~ 'microsoft.sql/servers'
| project name, subscriptionId, resourceGroup, location,
    publicNetworkAccess = tostring(properties.publicNetworkAccess),
    minimalTlsVersion = tostring(properties.minimalTlsVersion),
    fqdn = tostring(properties.fullyQualifiedDomainName)
`.trim();

// System "master" databases exist on every server and aren't user data — excluded since
// they're not a capacity/sizing decision anyone makes.
const SQL_DATABASES_QUERY = `
Resources
| where type =~ 'microsoft.sql/servers/databases'
| extend dbName = tostring(split(id, '/')[10]), serverName = tostring(split(id, '/')[8])
| where dbName !~ 'master'
| project name = dbName, serverName, subscriptionId, resourceGroup, location,
    status = tostring(properties.status),
    zoneRedundant = tobool(properties.zoneRedundant),
    skuName = tostring(sku.name),
    skuTier = tostring(sku.tier),
    skuCapacity = toint(sku.capacity),
    minCapacity = todouble(properties.minCapacity),
    maxSizeBytes = tolong(properties.maxSizeBytes)
`.trim();

interface RawDatabaseRow extends Omit<SqlDatabaseInfo, "maxSizeGB"> {
  maxSizeBytes: number | null;
}

export async function fetchSqlSecurity(subscriptionIds: string[]): Promise<SqlSecurityReport> {
  const [servers, rawDatabases] = await Promise.all([
    queryResourceGraph<SqlServerInfo>(subscriptionIds, SQL_SERVERS_QUERY),
    queryResourceGraph<RawDatabaseRow>(subscriptionIds, SQL_DATABASES_QUERY),
  ]);

  const databases: SqlDatabaseInfo[] = rawDatabases.map((d) => ({
    name: d.name,
    serverName: d.serverName,
    subscriptionId: d.subscriptionId,
    resourceGroup: d.resourceGroup,
    location: d.location,
    status: d.status,
    zoneRedundant: d.zoneRedundant,
    skuName: d.skuName,
    skuTier: d.skuTier,
    skuCapacity: d.skuCapacity,
    minCapacity: d.minCapacity,
    maxSizeGB: d.maxSizeBytes != null ? Math.round((d.maxSizeBytes / 1024 / 1024 / 1024) * 100) / 100 : null,
  }));

  return {
    generatedAt: new Date().toISOString(),
    servers: servers.sort((a, b) => a.name.localeCompare(b.name)),
    databases: databases.sort((a, b) => a.name.localeCompare(b.name)),
  };
}
