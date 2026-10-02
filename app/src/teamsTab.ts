import { app, authentication } from "@microsoft/teams-js";

// Read by client.ts/useAuth.ts to authenticate API calls and derive the user's identity — the
// SWA auth cookie a normal login sets lives in a partitioned/third-party context inside the
// Teams iframe and never reaches this page's own requests (SameSite), so the API is handed
// this token directly instead of relying on the cookie.
const TOKEN_STORAGE_KEY = "finops-teams-token";

const statusEl = document.getElementById("teams-status");

function setStatus(text: string) {
  const p = statusEl?.querySelector("p");
  if (p) p.textContent = text;
}

async function bootApp() {
  statusEl?.remove();
  // The real app's routes are all absolute paths (/, /executive-summary, ...) — rewrite the
  // visible URL to / before mounting so react-router matches something, without an actual
  // navigation (which would reload this page and lose the token we just got).
  window.history.replaceState(null, "", "/");
  await import("./main.tsx");
}

// app.initialize() resolves even outside Teams (it doesn't require an actual host to answer),
// so it can't be used on its own to detect "not in Teams". Teams always loads tabs inside an
// iframe though, so check that first — anyone opening this link directly in a normal browser
// tab (window.self === window.top) gets sent straight to the real app instead.
async function main() {
  if (window.self === window.top) {
    window.location.replace("/");
    return;
  }

  try {
    await app.initialize();
  } catch {
    window.location.replace("/");
    return;
  }

  setStatus("Conectando…");
  try {
    const token = await authentication.getAuthToken();
    sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
    await bootApp();
  } catch {
    setStatus("Não foi possível autenticar automaticamente pelo Teams. Recarregue a aba e tente novamente.");
  }
}

main();
