// Everything that identifies the client this deployment belongs to. Swapping a client
// should mean editing this file and dropping in a logo — nothing else in app/src should
// name a client, a subscription or a domain.
//
// Read from Vite env vars so the same source tree can be built per client from CI without
// editing files. The fallbacks below are what a local `npm run dev` uses.

const env = import.meta.env;

export const brand = {
  /** Shown in the sidebar, the browser tab and the login screen. */
  productName: env.VITE_PRODUCT_NAME ?? "Observabilidade",

  /** The client this deployment monitors. Used in page subtitles. */
  clientName: env.VITE_CLIENT_NAME ?? "Spassu",

  /** Path under app/public. Replace the file, keep the name, or point this elsewhere. */
  logoPath: env.VITE_LOGO_PATH ?? "/client-logo.svg",
  logoAlt: env.VITE_LOGO_ALT ?? env.VITE_CLIENT_NAME ?? "Spassu",

  /** Human-readable names of the monitored subscriptions, for page subtitles. Comma
   *  separated. Purely cosmetic — the backend decides what is actually monitored. */
  subscriptionLabels: (env.VITE_SUBSCRIPTION_LABELS ?? "")
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean) as string[],

  /** Function App hostname, used only by the Teams tab, which bypasses the Static Web App
   *  proxy. Empty disables that path; normal browser usage never needs it. */
  functionAppBaseUrl: env.VITE_FUNCTION_APP_BASE_URL ?? "",

  /** Demo build: no login and no API, the page shows fictitious data from src/demo. */
  demo: env.VITE_DEMO === "true",
};

/** "Produção e Homologação" (the configured labels joined), or a neutral phrase when no labels are configured. Callers put
 *  it after an em dash, so it has to read on its own without an article in front of it. */
export function subscriptionsLabel(): string {
  const labels = brand.subscriptionLabels;
  if (labels.length === 0) return "assinaturas monitoradas";
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(", ")} e ${labels[labels.length - 1]}`;
}
