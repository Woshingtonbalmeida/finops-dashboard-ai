// Every value that changes from one client deployment to the next lives here. Nothing
// outside this file should hard-code a subscription id, tenant, container or hostname —
// if you find yourself typing one somewhere else, it belongs in this file instead.
//
// Values come from environment variables (app settings on the Function App) so the same
// build artifact can be deployed to dev and prod without a rebuild. The defaults are
// deliberately absent: a missing value fails loudly at startup rather than silently
// monitoring the wrong subscription.

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`App setting obrigatória ausente: ${name}. Veja api/src/config/client.ts.`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

export interface MonitoredSubscription {
  subscriptionId: string;
  /** Short slug used to name this subscription's raw export container, e.g. "contoso"
   *  produces the container "exports-contoso". Lower-case, no spaces. */
  slug: string;
}

// Format: "<slug>:<subscriptionId>,<slug>:<subscriptionId>"
// Example: "contoso:00000000-0000-0000-0000-000000000000,fabrikam:11111111-..."
//
// The slug is part of the blob container name, so changing it after the first export run
// orphans the previous container — pick it once, at onboarding, and leave it alone.
function parseSubscriptions(): MonitoredSubscription[] {
  const raw = required("MONITORED_SUBSCRIPTIONS");
  const entries = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [slug, subscriptionId] = part.split(":").map((s) => s.trim());
      if (!slug || !subscriptionId) {
        throw new Error(`MONITORED_SUBSCRIPTIONS mal formatada em "${part}". Esperado "<slug>:<subscriptionId>".`);
      }
      return { slug: slug.toLowerCase(), subscriptionId };
    });
  if (entries.length === 0) {
    throw new Error("MONITORED_SUBSCRIPTIONS não pode ser vazia.");
  }
  return entries;
}

let cached: MonitoredSubscription[] | undefined;

export function monitoredSubscriptions(): MonitoredSubscription[] {
  cached ??= parseSubscriptions();
  return cached;
}

export function subscriptionIds(): string[] {
  return monitoredSubscriptions().map((s) => s.subscriptionId);
}

export function rawContainerName(slug: string): string {
  return `exports-${slug}`;
}

export function rawContainers(): string[] {
  return monitoredSubscriptions().map((s) => rawContainerName(s.slug));
}

export const CURATED_CONTAINER = "curated";

// Name of the Cost Management export defined in each monitored subscription. The daily
// timer triggers a run of this export by name, so it must match what was created there.
export function exportName(): string {
  return optional("COST_EXPORT_NAME", "finops-export-daily");
}

export interface AuthConfig {
  tenantId: string;
  clientId: string;
  /** Custom App ID URI, when the app registration exposes one — used as an accepted
   *  audience alongside the bare client id. Empty when not configured. */
  appIdUri: string;
}

export function authConfig(): AuthConfig {
  return {
    tenantId: required("AAD_TENANT_ID"),
    clientId: required("AAD_CLIENT_ID"),
    appIdUri: optional("AAD_APP_ID_URI", ""),
  };
}

// Tag governance policy initiative per subscription, when the client has one. The page
// falls back to a direct/inherited-tag approximation for any subscription not listed, so
// leaving this unset degrades gracefully instead of breaking the page.
//
// Format: "<subscriptionId>=<policySetDefinitionResourceId>;<subscriptionId>=..."
export function tagPolicyInitiatives(): Record<string, string> {
  const raw = optional("TAG_POLICY_INITIATIVES", "");
  const map: Record<string, string> = {};
  for (const part of raw.split(";").map((p) => p.trim()).filter(Boolean)) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    map[part.slice(0, separator).trim()] = part.slice(separator + 1).trim();
  }
  return map;
}

// Tag keys the governance page reports on, in the order the policy initiative declares
// its parameter references (_1.._N).
export function governedTagKeys(): string[] {
  return optional("GOVERNED_TAG_KEYS", "OWNER,ENV,PRODUTO,CLIENTE")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}
