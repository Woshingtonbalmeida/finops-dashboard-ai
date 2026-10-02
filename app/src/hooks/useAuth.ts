import { useEffect, useState } from "react";
import { brand } from "../config/brand";

interface ClientPrincipal {
  userDetails: string;
  userRoles: string[];
}

// The token's signature/audience/issuer are already verified server-side on every /api/*
// call (api/src/lib/auth.ts) — this decode is display-only, just to read the user's name
// out of the payload, not a trust boundary.
function principalFromTeamsToken(token: string): ClientPrincipal | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    const userDetails = payload.name ?? payload.preferred_username ?? payload.upn ?? "Usuário Teams";
    return { userDetails, userRoles: ["authenticated"] };
  } catch {
    return null;
  }
}

export function useAuth() {
  const [principal, setPrincipal] = useState<ClientPrincipal | null | undefined>(undefined);

  useEffect(() => {
    // The demo build is published without authentication.
    if (brand.demo) {
      setPrincipal({ userDetails: "Demonstração — dados fictícios", userRoles: ["anonymous"] });
      return;
    }

    // Set by teams-tab.html after Teams SSO — running inside that iframe, the SWA auth
    // cookie from a normal login never reaches this page (SameSite/third-party context), so
    // identity comes from the token instead of /.auth/me.
    const teamsToken = sessionStorage.getItem("finops-teams-token");
    if (teamsToken) {
      setPrincipal(principalFromTeamsToken(teamsToken));
      return;
    }

    fetch("/.auth/me")
      .then((r) => r.json())
      .then((data) => setPrincipal(data?.clientPrincipal ?? null))
      .catch(() => setPrincipal(null));
  }, []);

  return principal;
}
