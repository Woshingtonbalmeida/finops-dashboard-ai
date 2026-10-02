import type {
  AiInsightsReport,
  BudgetsReport,
  CreatedResourcesReport,
  CuratedSummary,
  DailyCostByMonthReport,
  DeletionCandidatesReport,
  DeletionStatusHistoryReport,
  DeletionStatusValue,
  ForecastReport,
  IncentiveSubscription,
  IncentiveSubscriptionsReport,
  MonthlyHistoryReport,
  InventoryReport,
  MonthVarianceReport,
  OptimizationReport,
  OrphanedResourcesReport,
  PipelineHealthReport,
  ResourceSizingReport,
  SecurityReport,
  ServiceTarget,
  ServiceTargetsReport,
  SqlSecurityReport,
  StoppedAksReport,
  StoppedVMsReport,
  TagComplianceReport,
  TagsByMonthReport,
  VarianceDimension,
  VarianceNotesReport,
  VersionInfo,
} from "../types";

// Set by teams-tab.html after Teams SSO. Static Web Apps' managed proxy for /api/* only
// forwards requests already gated by its own cookie-based "authenticated" role — turning that
// role to anonymous (needed to let a bearer-only request through) breaks the proxy outright
// (confirmed against production: every /api/* call 404'd, not just Teams'). So when running in
// Teams, bypass the SWA proxy entirely and call the Function App's own hostname directly — CORS
// is opened for this origin, and the Function App's own auth defers to withAuth on every route,
// which accepts this same bearer token. Regular browser usage never sets this token, so it
// keeps going through the SWA proxy exactly as before.
import { brand } from "../config/brand";
import { buildDemoAiUsage } from "../demo/aiUsageDemo";

const TEAMS_TOKEN_KEY = "finops-teams-token";
const FUNCTION_APP_BASE_URL = brand.functionAppBaseUrl;

function apiUrl(path: string): string {
  const token = sessionStorage.getItem(TEAMS_TOKEN_KEY);
  return token && FUNCTION_APP_BASE_URL ? `${FUNCTION_APP_BASE_URL}/${path}` : `/api/${path}`;
}

function teamsAuthHeader(): Record<string, string> {
  const token = sessionStorage.getItem(TEAMS_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Carries the HTTP status so callers can tell "not collected yet" (503, which the API
 *  returns with its own explanation) apart from a genuine failure. Without this every
 *  non-OK response looked like a broken dashboard. */
export class ApiError extends Error {
  // A plain field rather than a constructor parameter property: this project builds with
  // erasableSyntaxOnly, which rejects the shorthand.
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// The API answers a not-ready route with 503 and a JSON body explaining why, so that
// message is preferred over a generic one built from the status code.
async function apiErrorFrom(response: Response, path: string): Promise<ApiError> {
  let message = `Falha ao buscar /api/${path}: ${response.status}`;
  try {
    const body = (await response.json()) as { message?: unknown };
    if (typeof body?.message === "string" && body.message.length > 0) message = body.message;
  } catch {
    // Body absent or not JSON — the status-based message above stands.
  }
  return new ApiError(message, response.status);
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(apiUrl(path), { credentials: "same-origin", headers: teamsAuthHeader() });
  if (!response.ok) {
    throw await apiErrorFrom(response, path);
  }
  return (await response.json()) as T;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(apiUrl(path), {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...teamsAuthHeader() },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw await apiErrorFrom(response, path);
  }
  return (await response.json()) as T;
}

// The demo build only renders the AI page, which reads nothing but summary.aiUsage.
function demoSummary(): Promise<CuratedSummary> {
  return Promise.resolve({ aiUsage: buildDemoAiUsage() } as CuratedSummary);
}

export const api = {
  getSummary: () => (brand.demo ? demoSummary() : getJson<CuratedSummary>("summary")),
  refreshSummary: () => (brand.demo ? demoSummary() : postJson<CuratedSummary>("summary/refresh", {})),
  getBudgets: () => getJson<BudgetsReport>("budgets"),
  refreshBudgets: () => postJson<BudgetsReport>("budgets/refresh", {}),
  getOptimization: () => getJson<OptimizationReport>("optimization"),
  refreshOptimization: () => postJson<OptimizationReport>("optimization/refresh", {}),
  getForecast: () => getJson<ForecastReport>("forecast"),
  refreshForecast: () => postJson<ForecastReport>("forecast/refresh", {}),
  getMonthlyHistory: () => getJson<MonthlyHistoryReport>("monthly-history"),
  refreshMonthlyHistory: () => postJson<MonthlyHistoryReport>("monthly-history/refresh", {}),
  getOrphanedResources: () => getJson<OrphanedResourcesReport>("orphaned-resources"),
  getTagCompliance: () => getJson<TagComplianceReport>("tag-compliance"),
  refreshTagCompliance: () => postJson<TagComplianceReport>("tag-compliance/refresh", {}),
  getStoppedVMs: () => getJson<StoppedVMsReport>("stopped-vms"),
  refreshStoppedVMs: () => postJson<StoppedVMsReport>("stopped-vms/refresh", {}),
  getStoppedAks: () => getJson<StoppedAksReport>("stopped-aks"),
  refreshStoppedAks: () => postJson<StoppedAksReport>("stopped-aks/refresh", {}),
  getSecurity: () => getJson<SecurityReport>("security"),
  getDeletionCandidates: () => getJson<DeletionCandidatesReport>("deletion-candidates"),
  setDeletionStatus: (resourceId: string, status: DeletionStatusValue) =>
    postJson<{ updatedAt: string }>("deletion-status", { resourceId, status }),
  setDeletionStatusBulk: (resourceIds: string[], status: DeletionStatusValue) =>
    postJson<{ updatedAt: string }>("deletion-status/bulk", { resourceIds, status }),
  getDeletionStatusHistory: () => getJson<DeletionStatusHistoryReport>("deletion-status-history"),
  refreshDeletionStatusHistory: () => postJson<DeletionStatusHistoryReport>("deletion-status-history/refresh", {}),
  getServiceTargets: () => getJson<ServiceTargetsReport>("service-targets"),
  setServiceTargets: (targets: ServiceTarget[]) => postJson<ServiceTargetsReport>("service-targets", { targets }),
  getVersion: () => getJson<VersionInfo>("version"),
  getAiInsights: () => getJson<AiInsightsReport>("ai-insights"),
  refreshAiInsights: () => postJson<AiInsightsReport>("ai-insights/refresh", {}),
  getSqlSecurity: () => getJson<SqlSecurityReport>("sql-security"),
  refreshSqlSecurity: () => postJson<SqlSecurityReport>("sql-security/refresh", {}),
  getResourceSizing: () => getJson<ResourceSizingReport>("resource-sizing"),
  refreshResourceSizing: () => postJson<ResourceSizingReport>("resource-sizing/refresh", {}),
  getTagsByMonth: (month: string) => getJson<TagsByMonthReport>(`tags-by-month?month=${month}`),
  getDailyCostByMonth: (month: string) => getJson<DailyCostByMonthReport>(`daily-cost-by-month?month=${month}`),
  getIncentiveSubscriptions: () => getJson<IncentiveSubscriptionsReport>("incentive-subscriptions"),
  setIncentiveSubscriptions: (subscriptions: IncentiveSubscription[]) =>
    postJson<IncentiveSubscriptionsReport>("incentive-subscriptions", { subscriptions }),
  getCreatedResources: () => getJson<CreatedResourcesReport>("created-resources"),
  refreshCreatedResources: () => postJson<CreatedResourcesReport>("created-resources/refresh", {}),
  getPipelineHealth: () => getJson<PipelineHealthReport>("pipeline-health"),
  getInventory: () => getJson<InventoryReport>("inventory"),
  refreshInventory: () => postJson<InventoryReport>("inventory/refresh", {}),
  getMonthVariance: (dimension: VarianceDimension, fromMonth?: string, toMonth?: string) => {
    const params = new URLSearchParams({ dimension });
    if (fromMonth) params.set("from", fromMonth);
    if (toMonth) params.set("to", toMonth);
    return getJson<MonthVarianceReport>(`month-variance?${params.toString()}`);
  },
  setMonthVarianceNote: (input: SetMonthVarianceNoteInput) => postJson<VarianceNotesReport>("month-variance/note", input),
};

export interface SetMonthVarianceNoteInput {
  dimension: VarianceDimension;
  key: string;
  subscriptionId: string;
  fromMonth: string;
  toMonth: string;
  note: string;
}
