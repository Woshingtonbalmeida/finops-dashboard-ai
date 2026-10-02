import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import jwt, { JwtHeader, JwtPayload, SigningKeyCallback } from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import { authConfig } from "../config/client";

const { tenantId: TENANT_ID, clientId: CLIENT_ID, appIdUri: APP_ID_URI } = authConfig();
// The app registration may expose a custom App ID URI; when it does, a token minted for
// it carries that URI as its audience instead of the bare client id, so both are accepted.
const EXPECTED_AUDIENCES: [string, ...string[]] = APP_ID_URI
  ? [CLIENT_ID, `${APP_ID_URI}/${CLIENT_ID}`]
  : [CLIENT_ID];
const EXPECTED_ISSUERS: [string, string] = [
  `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
  `https://sts.windows.net/${TENANT_ID}/`,
];

const jwks = jwksClient({
  jwksUri: `https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`,
  cache: true,
  rateLimit: true,
});

function getSigningKey(header: JwtHeader, callback: SigningKeyCallback): void {
  if (!header.kid) {
    callback(new Error("Token sem 'kid' no header"));
    return;
  }
  jwks.getSigningKey(header.kid, (err, key) => {
    if (err || !key) {
      callback(err ?? new Error("Chave de assinatura não encontrada"));
      return;
    }
    callback(null, key.getPublicKey());
  });
}

function verifyBearerToken(token: string): Promise<JwtPayload> {
  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      getSigningKey,
      { audience: EXPECTED_AUDIENCES, issuer: EXPECTED_ISSUERS, algorithms: ["RS256"] },
      (err, decoded) => {
        if (err || !decoded || typeof decoded === "string") {
          reject(err ?? new Error("Token decodificado em formato inesperado"));
          return;
        }
        resolve(decoded);
      }
    );
  });
}

export type ApiHandler = (req: HttpRequest, context: InvocationContext) => Promise<HttpResponseInit>;

// Best-effort display name for attributing a write to whoever made it. Only the SWA cookie
// path carries this header, so the Teams bearer path returns "" — callers must treat an
// empty string as "unknown", never as a failure.
export function getPrincipalName(req: HttpRequest): string {
  const header = req.headers.get("x-ms-client-principal");
  if (!header) return "";
  try {
    const principal = JSON.parse(Buffer.from(header, "base64").toString("utf-8"));
    return typeof principal?.userDetails === "string" ? principal.userDetails : "";
  } catch {
    return "";
  }
}

function hasSwaPrincipal(req: HttpRequest): boolean {
  const header = req.headers.get("x-ms-client-principal");
  if (!header) return false;
  try {
    const principal = JSON.parse(Buffer.from(header, "base64").toString("utf-8"));
    return typeof principal?.userId === "string" && principal.userId.length > 0;
  } catch {
    return false;
  }
}

async function hasValidBearerToken(req: HttpRequest, context: InvocationContext): Promise<boolean> {
  const match = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  try {
    const payload = await verifyBearerToken(match[1]);
    return typeof payload.sub === "string" && payload.sub.length > 0;
  } catch (err) {
    context.warn(`Bearer token rejeitado: ${(err as Error).message}`);
    return false;
  }
}

// Static Web Apps' Easy Auth (cookie session) already blocks unauthenticated requests to
// /api/* before this code ever runs — that's the normal browser path, unaffected here. The
// one exception is the Teams tab: it runs inside a third-party iframe where the auth cookie
// isn't readable (SameSite), so it authenticates via a Teams SSO bearer token instead. Since
// /api/* has to be routed as anonymous at the SWA layer for that token to even reach this
// code, every handler is wrapped to require EITHER a valid SWA principal OR a valid bearer
// token — nothing here is reachable without one or the other.
export function withAuth(handler: ApiHandler): ApiHandler {
  return async (req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    if (hasSwaPrincipal(req) || (await hasValidBearerToken(req, context))) {
      return handler(req, context);
    }
    return { status: 401, jsonBody: { message: "Não autenticado." } };
  };
}
