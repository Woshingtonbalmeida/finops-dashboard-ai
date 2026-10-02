import { governedTagKeys, tagPolicyInitiatives } from "../config/client";
import { DefaultAzureCredential } from "@azure/identity";

const credential = new DefaultAzureCredential();

async function getManagementToken(): Promise<string> {
  const token = await credential.getToken("https://management.azure.com/.default");
  if (!token) throw new Error("Não foi possível obter token de acesso para management.azure.com");
  return token.token;
}

// The client's tag governance policy set (enforced on resource groups) requires these
// four — tracked here at the resource level.
export const REQUIRED_TAG_KEYS = ["PRODUTO", "CLIENTE", "ENV", "OWNER"] as const;

export interface SubscriptionTagCompliance {
  subscriptionId: string;
  totalResources: number;
  missingAnyRequiredTag: number;
  missingByTag: Record<string, number>;
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

// The org's tag governance policy initiative — one assignment per subscription,
// each wrapping two component policies per tag: "Inherit a tag from the resource group
// if missing" (evaluates general resources) and "Require a tag on resource groups"
// (evaluates resource groups themselves). Azure's own Policy | Compliance blade counts
// both together as one "resource compliance" tally, which is what this reproduces.
// These are the org's current initiative IDs (not portable to another tenant) — if the
// initiative is ever recreated, PolicyResources returns nothing for the stale ID and
// fetchTagCompliance falls back to the direct/inherited-tag approximation below.
const TAG_POLICY_INITIATIVES: Record<string, string> = tagPolicyInitiatives();

// Both component policies parameterize their 4 references identically: _1=OWNER,
// _2=ENV, _3=PRODUTO, _4=CLIENTE (confirmed by reading the initiative's own definition,
// not assumed) — same order regardless of which of the two policies the reference
// belongs to.
const REFERENCE_SUFFIX_TO_TAG: Record<string, string> = Object.fromEntries(
  governedTagKeys().map((tag, index) => [`_${index + 1}`, tag])
);

interface PolicyComplianceRow {
  subscriptionId: string;
  total: number;
  missingAny: number;
  missingProduto: number;
  missingCliente: number;
  missingEnv: number;
  missingOwner: number;
}

// Aggregates server-side in two summarize stages (per resource+tag, then per
// subscription) instead of pulling raw per-resource-per-tag policy-state rows into JS —
// a subscription with ~1000 resources can have up to 8 state rows each (4 tags × 2
// component policies), several times over Resource Graph's per-page row cap, so
// returning raw rows silently truncated results before this was fixed.
async function fetchFromPolicyCompliance(subscriptionIds: string[]): Promise<SubscriptionTagCompliance[] | null> {
  const initiativeIds = subscriptionIds.map((id) => TAG_POLICY_INITIATIVES[id]).filter((v): v is string => !!v);
  if (initiativeIds.length === 0) return null;

  const tagCase = Object.entries(REFERENCE_SUFFIX_TO_TAG)
    .map(([suffix, tag]) => `refId endswith '${suffix}', '${tag}'`)
    .join(", ");

  const rows = await queryResourceGraph<PolicyComplianceRow>(
    subscriptionIds,
    `
PolicyResources
| where type == 'microsoft.policyinsights/policystates'
| where properties.policySetDefinitionId in (${initiativeIds.map((id) => `'${id}'`).join(", ")})
| extend refId = tostring(properties.policyDefinitionReferenceId)
| extend tagKey = case(${tagCase}, 'UNKNOWN')
| extend resId = tostring(properties.resourceId)
| extend compliant = properties.complianceState == 'Compliant'
| summarize missingProduto = countif(tagKey == 'PRODUTO' and not(compliant)) > 0,
            missingCliente = countif(tagKey == 'CLIENTE' and not(compliant)) > 0,
            missingEnv = countif(tagKey == 'ENV' and not(compliant)) > 0,
            missingOwner = countif(tagKey == 'OWNER' and not(compliant)) > 0
  by resId, subscriptionId
| summarize total = count(),
    missingProduto = countif(missingProduto),
    missingCliente = countif(missingCliente),
    missingEnv = countif(missingEnv),
    missingOwner = countif(missingOwner),
    missingAny = countif(missingProduto or missingCliente or missingEnv or missingOwner)
  by subscriptionId
`.trim()
  );
  if (rows.length === 0) return null;

  return rows.map((row) => ({
    subscriptionId: row.subscriptionId,
    totalResources: row.total,
    missingAnyRequiredTag: row.missingAny,
    missingByTag: { PRODUTO: row.missingProduto, CLIENTE: row.missingCliente, ENV: row.missingEnv, OWNER: row.missingOwner },
  }));
}

// Fallback for a subscription without a known policy initiative ID (or if
// PolicyResources has nothing for it): approximates the same "resource or its resource
// group carries the tag" logic directly from resource/RG tags, instead of the policy
// engine's own evaluation. Less exact (doesn't know about policy exemptions or the
// resource-type scope the initiative targets) but self-contained — no dependency on the
// org's specific policy setup.
async function fetchFromTagInheritance(subscriptionIds: string[]): Promise<SubscriptionTagCompliance[]> {
  const [p, c, e, o] = REQUIRED_TAG_KEYS.map((k) => `eff${k}`);
  const missingClause = (v: string) => `isnull(${v}) or ${v} == ''`;
  const missingClauses = [p, c, e, o].map(missingClause);
  const query = `
ResourceContainers
| where type == 'microsoft.resources/subscriptions/resourcegroups'
| project subscriptionId, rgKey = tolower(name), rgTags = tags
| join kind=inner (
    Resources
    | project subscriptionId, rgKey = tolower(resourceGroup), tags
  ) on subscriptionId, rgKey
| extend ${p} = coalesce(tags['${REQUIRED_TAG_KEYS[0]}'], rgTags['${REQUIRED_TAG_KEYS[0]}']),
         ${c} = coalesce(tags['${REQUIRED_TAG_KEYS[1]}'], rgTags['${REQUIRED_TAG_KEYS[1]}']),
         ${e} = coalesce(tags['${REQUIRED_TAG_KEYS[2]}'], rgTags['${REQUIRED_TAG_KEYS[2]}']),
         ${o} = coalesce(tags['${REQUIRED_TAG_KEYS[3]}'], rgTags['${REQUIRED_TAG_KEYS[3]}'])
| summarize
    total = count(),
    missingProduto = countif(${missingClauses[0]}),
    missingCliente = countif(${missingClauses[1]}),
    missingEnv = countif(${missingClauses[2]}),
    missingOwner = countif(${missingClauses[3]}),
    missingAny = countif(${missingClauses.join(" or ")})
  by subscriptionId
`.trim();

  interface Row {
    subscriptionId: string;
    total: number;
    missingAny: number;
    missingProduto: number;
    missingCliente: number;
    missingEnv: number;
    missingOwner: number;
  }
  const rows = await queryResourceGraph<Row>(subscriptionIds, query);
  return rows.map((row) => ({
    subscriptionId: row.subscriptionId,
    totalResources: row.total,
    missingAnyRequiredTag: row.missingAny,
    missingByTag: { PRODUTO: row.missingProduto, CLIENTE: row.missingCliente, ENV: row.missingEnv, OWNER: row.missingOwner },
  }));
}

export async function fetchTagCompliance(subscriptionIds: string[]): Promise<SubscriptionTagCompliance[]> {
  const fromPolicy = await fetchFromPolicyCompliance(subscriptionIds);
  if (fromPolicy && fromPolicy.length === subscriptionIds.length) return fromPolicy;

  // Partial or no policy-engine data (e.g. one subscription's initiative ID is stale) —
  // fall back to the approximation for whichever subscriptions are missing, keep the
  // exact policy-engine numbers for the rest.
  const fallback = await fetchFromTagInheritance(subscriptionIds);
  if (!fromPolicy) return fallback;
  const covered = new Set(fromPolicy.map((r) => r.subscriptionId));
  return [...fromPolicy, ...fallback.filter((r) => !covered.has(r.subscriptionId))];
}
