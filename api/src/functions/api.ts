import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { readJsonBlob } from "../lib/storage";
import { CuratedSummary } from "../lib/focus";
import { BudgetsReport, refreshBudgetsNow } from "../lib/budgets";
import { OptimizationReport } from "../lib/optimization";
import { ForecastReport, refreshForecastNow } from "../lib/forecast";
import { MonthlyHistoryReport, refreshMonthlyHistoryNow } from "../lib/monthlyHistory";
import { OrphanedResource } from "../lib/orphanedResources";
import { TagComplianceReport, refreshTagComplianceNow } from "./refreshTagCompliance";
import { StoppedVMsReport, refreshStoppedVMsNow } from "../lib/stoppedVMs";
import { StoppedAksReport, refreshStoppedAksNow } from "../lib/stoppedAks";
import { SubscriptionSecurity } from "../lib/security";
import { SqlSecurityReport } from "../lib/sqlSecurity";
import { ResourceSizingReport } from "../lib/resourceSizing";
import { refreshResourceSizingNow } from "./refreshResourceSizing";
import { DeletionCandidate } from "../lib/deletionCandidates";
import { readServiceTargets, writeServiceTargets } from "../lib/serviceTargets";
import { readIncentiveSubscriptions, writeIncentiveSubscriptions } from "../lib/incentiveSubscriptions";
import {
  DeletionStatusValue,
  readDeletionStatuses,
  refreshDeletionSavingsNow,
  setDeletionStatus,
  setDeletionStatusBulk,
} from "../lib/deletionStatus";
import { rebuildCurated } from "../lib/rebuildCurated";
import { fetchTagsByMonth } from "../lib/tagsByMonth";
import { fetchDailyCostByMonth } from "../lib/dailyCostByMonth";
import { refreshOptimizationNow } from "./refreshOptimization";
import { getPrincipalName, withAuth } from "../lib/auth";
import { getMonthVariance, setVarianceNote, VarianceDimension } from "../lib/monthVariance";
import { getVersionInfo } from "../lib/version";
import { refreshSqlSecurityNow } from "./refreshSqlSecurity";
import { AiInsightsReport, refreshAiInsightsNow } from "../lib/aiInsights";
import { CreatedResourcesReport, refreshCreatedResourcesNow } from "../lib/createdResources";
import { fetchPipelineHealth } from "../lib/pipelineHealth";
import { InventoryReport, refreshInventoryNow } from "../lib/inventory";

interface OrphanedResourcesReport {
  generatedAt: string;
  resources: OrphanedResource[];
  totalMtdCost: number;
  currency: string;
}

interface SecurityReport {
  generatedAt: string;
  bySubscription: SubscriptionSecurity[];
}

interface DeletionCandidatesReport {
  generatedAt: string;
  resources: DeletionCandidate[];
  totalMtdCost: number;
  currency: string;
}

interface DeletionCandidateWithStatus extends DeletionCandidate {
  status: DeletionStatusValue;
}

const CURATED_CONTAINER = "curated";

async function loadSummary(): Promise<CuratedSummary | undefined> {
  return readJsonBlob<CuratedSummary>(CURATED_CONTAINER, "summary.json");
}

function json(body: unknown): HttpResponseInit {
  return { status: 200, jsonBody: body };
}

function notReady(): HttpResponseInit {
  return { status: 503, jsonBody: { message: "Ainda não há dados agregados. Aguarde o primeiro export processar." } };
}

app.http("getSummary", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "summary",
  handler: withAuth(async (_req: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> => {
    const summary = await loadSummary();
    return summary ? json(summary) : notReady();
  }),
});

app.http("getTagsByMonth", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "tags-by-month",
  handler: withAuth(async (req: HttpRequest): Promise<HttpResponseInit> => {
    const month = req.query.get("month");
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return { status: 400, jsonBody: { message: "Parâmetro 'month' obrigatório, no formato YYYY-MM." } };
    }
    const report = await fetchTagsByMonth(month);
    return json(report);
  }),
});

app.http("getDailyCostByMonth", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "daily-cost-by-month",
  handler: withAuth(async (req: HttpRequest): Promise<HttpResponseInit> => {
    const month = req.query.get("month");
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return { status: 400, jsonBody: { message: "Parâmetro 'month' obrigatório, no formato YYYY-MM." } };
    }
    const report = await fetchDailyCostByMonth(month);
    return json(report);
  }),
});

app.http("refreshSummaryOnDemand", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "summary/refresh",
  handler: withAuth(async (_req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    await rebuildCurated(context);
    const summary = await loadSummary();
    return summary ? json(summary) : notReady();
  }),
});

app.http("getBySubscription", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "by-subscription",
  handler: withAuth(async (): Promise<HttpResponseInit> => {
    const summary = await loadSummary();
    return summary ? json(summary.bySubscription) : notReady();
  }),
});

app.http("getByService", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "by-service",
  handler: withAuth(async (): Promise<HttpResponseInit> => {
    const summary = await loadSummary();
    return summary ? json(summary.byService) : notReady();
  }),
});

app.http("getByResourceGroup", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "by-resource-group",
  handler: withAuth(async (): Promise<HttpResponseInit> => {
    const summary = await loadSummary();
    return summary ? json(summary.byResourceGroup) : notReady();
  }),
});

app.http("getByTags", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "by-tags",
  handler: withAuth(async (): Promise<HttpResponseInit> => {
    const summary = await loadSummary();
    return summary ? json(summary.byTag) : notReady();
  }),
});

app.http("getTrend", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "trend",
  handler: withAuth(async (): Promise<HttpResponseInit> => {
    const summary = await loadSummary();
    return summary ? json(summary.trend) : notReady();
  }),
});

app.http("getBudgets", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "budgets",
  handler: withAuth(async (): Promise<HttpResponseInit> => {
    const budgets = await readJsonBlob<BudgetsReport>(CURATED_CONTAINER, "budgets.json");
    return budgets ? json(budgets) : notReady();
  }),
});

app.http("refreshBudgetsOnDemand", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "budgets/refresh",
  handler: withAuth(async (_req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const report = await refreshBudgetsNow((message) => context.warn(message));
    return json(report);
  }),
});

app.http("getForecast", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "forecast",
  handler: withAuth(async (): Promise<HttpResponseInit> => {
    const forecast = await readJsonBlob<ForecastReport>(CURATED_CONTAINER, "forecast.json");
    return forecast ? json(forecast) : notReady();
  }),
});

app.http("refreshForecastOnDemand", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "forecast/refresh",
  handler: withAuth(async (_req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const report = await refreshForecastNow((message) => context.warn(message));
    return json(report);
  }),
});

app.http("getMonthlyHistory", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "monthly-history",
  handler: withAuth(async (): Promise<HttpResponseInit> => {
    const report = await readJsonBlob<MonthlyHistoryReport>(CURATED_CONTAINER, "monthly-history.json");
    return report ? json(report) : notReady();
  }),
});

app.http("refreshMonthlyHistoryOnDemand", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "monthly-history/refresh",
  handler: withAuth(async (_req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const report = await refreshMonthlyHistoryNow((message) => context.warn(message));
    return json(report);
  }),
});

app.http("getOrphanedResources", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "orphaned-resources",
  handler: withAuth(async (): Promise<HttpResponseInit> => {
    const report = await readJsonBlob<OrphanedResourcesReport>(CURATED_CONTAINER, "orphaned-resources.json");
    return report ? json(report) : notReady();
  }),
});

app.http("getTagCompliance", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "tag-compliance",
  handler: withAuth(async (): Promise<HttpResponseInit> => {
    const report = await readJsonBlob<TagComplianceReport>(CURATED_CONTAINER, "tag-compliance.json");
    return report ? json(report) : notReady();
  }),
});

app.http("refreshTagComplianceOnDemand", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "tag-compliance/refresh",
  handler: withAuth(async (_req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const report = await refreshTagComplianceNow((message) => context.warn(message));
    return json(report);
  }),
});

app.http("getStoppedVMs", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "stopped-vms",
  handler: withAuth(async (): Promise<HttpResponseInit> => {
    const report = await readJsonBlob<StoppedVMsReport>(CURATED_CONTAINER, "stopped-vms.json");
    return report ? json(report) : notReady();
  }),
});

app.http("refreshStoppedVMsOnDemand", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "stopped-vms/refresh",
  handler: withAuth(async (_req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const report = await refreshStoppedVMsNow((message) => context.warn(message));
    return json(report);
  }),
});

app.http("getStoppedAks", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "stopped-aks",
  handler: withAuth(async (): Promise<HttpResponseInit> => {
    const report = await readJsonBlob<StoppedAksReport>(CURATED_CONTAINER, "stopped-aks.json");
    return report ? json(report) : notReady();
  }),
});

app.http("refreshStoppedAksOnDemand", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "stopped-aks/refresh",
  handler: withAuth(async (_req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const report = await refreshStoppedAksNow((message) => context.warn(message));
    return json(report);
  }),
});

async function loadOptimization(): Promise<OptimizationReport | undefined> {
  return readJsonBlob<OptimizationReport>(CURATED_CONTAINER, "optimization.json");
}

app.http("getOptimization", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "optimization",
  handler: withAuth(async (): Promise<HttpResponseInit> => {
    const optimization = await loadOptimization();
    return optimization ? json(optimization) : notReady();
  }),
});

app.http("refreshOptimizationOnDemand", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "optimization/refresh",
  handler: withAuth(async (_req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const report = await refreshOptimizationNow((message) => context.warn(message));
    return json(report);
  }),
});

app.http("getAdvisorRecommendations", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "advisor",
  handler: withAuth(async (): Promise<HttpResponseInit> => {
    const optimization = await loadOptimization();
    return optimization ? json(optimization.advisorRecommendations) : notReady();
  }),
});

app.http("getReservations", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "reservations",
  handler: withAuth(async (): Promise<HttpResponseInit> => {
    const optimization = await loadOptimization();
    return optimization ? json(optimization.reservations) : notReady();
  }),
});

app.http("getSavingsPlans", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "savings-plans",
  handler: withAuth(async (): Promise<HttpResponseInit> => {
    const optimization = await loadOptimization();
    return optimization ? json(optimization.savingsPlans) : notReady();
  }),
});

app.http("getSecurity", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "security",
  handler: withAuth(async (): Promise<HttpResponseInit> => {
    const report = await readJsonBlob<SecurityReport>(CURATED_CONTAINER, "security.json");
    return report ? json(report) : notReady();
  }),
});

app.http("getSqlSecurity", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "sql-security",
  handler: withAuth(async (): Promise<HttpResponseInit> => {
    const report = await readJsonBlob<SqlSecurityReport>(CURATED_CONTAINER, "sql-security.json");
    return report ? json(report) : notReady();
  }),
});

app.http("refreshSqlSecurityOnDemand", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "sql-security/refresh",
  handler: withAuth(async (_req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const report = await refreshSqlSecurityNow((message) => context.warn(message));
    return json(report);
  }),
});

app.http("getResourceSizing", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "resource-sizing",
  handler: withAuth(async (): Promise<HttpResponseInit> => {
    const report = await readJsonBlob<ResourceSizingReport>(CURATED_CONTAINER, "resource-sizing.json");
    return report ? json(report) : notReady();
  }),
});

app.http("refreshResourceSizingOnDemand", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "resource-sizing/refresh",
  handler: withAuth(async (_req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const report = await refreshResourceSizingNow((message) => context.warn(message));
    return json(report);
  }),
});

app.http("getCreatedResources", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "created-resources",
  handler: withAuth(async (): Promise<HttpResponseInit> => {
    const report = await readJsonBlob<CreatedResourcesReport>(CURATED_CONTAINER, "created-resources.json");
    return report ? json(report) : notReady();
  }),
});

app.http("refreshCreatedResourcesOnDemand", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "created-resources/refresh",
  handler: withAuth(async (_req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const report = await refreshCreatedResourcesNow((message) => context.warn(message));
    return json(report);
  }),
});

// No persisted blob/refresh mutation — always computed live from blob metadata
// (cheap: getProperties, not a full download), so it's never stale on its own.
app.http("getPipelineHealth", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "pipeline-health",
  handler: withAuth(async (): Promise<HttpResponseInit> => {
    const report = await fetchPipelineHealth();
    return json(report);
  }),
});

// Computed live from monthly-history.json plus the notes blob rather than persisted as its
// own curated blob: both inputs already have their own refresh cycle, and the comparison is
// parameterised by month pair and dimension, so there's no single result worth caching.
app.http("getMonthVariance", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "month-variance",
  handler: withAuth(async (req: HttpRequest): Promise<HttpResponseInit> => {
    const dimensionParam = req.query.get("dimension");
    const dimension: VarianceDimension = dimensionParam === "resourceGroup" ? "resourceGroup" : "service";
    const report = await getMonthVariance(dimension, req.query.get("from") ?? undefined, req.query.get("to") ?? undefined);
    return report ? json(report) : notReady();
  }),
});

app.http("setMonthVarianceNote", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "month-variance/note",
  handler: withAuth(async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const body = await req.json();
      const report = await setVarianceNote(body, getPrincipalName(req));
      return json(report);
    } catch (err) {
      return { status: 400, jsonBody: { message: (err as Error).message } };
    }
  }),
});

app.http("getInventory", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "inventory",
  handler: withAuth(async (): Promise<HttpResponseInit> => {
    const report = await readJsonBlob<InventoryReport>(CURATED_CONTAINER, "inventory.json");
    return report ? json(report) : notReady();
  }),
});

app.http("refreshInventoryOnDemand", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "inventory/refresh",
  handler: withAuth(async (_req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const report = await refreshInventoryNow((message) => context.warn(message));
    return json(report);
  }),
});

app.http("getDeletionCandidates", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "deletion-candidates",
  handler: withAuth(async (): Promise<HttpResponseInit> => {
    const report = await readJsonBlob<DeletionCandidatesReport>(CURATED_CONTAINER, "deletion-candidates.json");
    if (!report) return notReady();
    // Status is stored separately and merged at request time (not baked into the daily
    // refresh) so a status change is reflected immediately, not just after tomorrow's run.
    const statusReport = await readDeletionStatuses();
    const statusByResourceId = new Map(statusReport.statuses.map((s) => [s.resourceId.toLowerCase(), s.status]));
    const resources: DeletionCandidateWithStatus[] = report.resources.map((r) => ({
      ...r,
      status: statusByResourceId.get(r.resourceId.toLowerCase()) ?? "Identificado",
    }));
    return json({ ...report, resources });
  }),
});

app.http("setDeletionStatus", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "deletion-status",
  handler: withAuth(async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const body = (await req.json()) as { resourceId?: unknown; status?: unknown };
      if (typeof body?.resourceId !== "string") throw new Error("resourceId inválido");

      const candidates = await readJsonBlob<DeletionCandidatesReport>(CURATED_CONTAINER, "deletion-candidates.json");
      const resource = candidates?.resources.find((r) => r.resourceId.toLowerCase() === (body.resourceId as string).toLowerCase());
      if (!resource) throw new Error("Recurso não encontrado em deletion-candidates.json");

      const summary = await loadSummary();
      const subscriptionName =
        summary?.bySubscription.find((s) => s.subscriptionId === resource.subscriptionId)?.subscriptionName ?? resource.subscriptionId;

      const report = await setDeletionStatus({
        resourceId: resource.resourceId,
        status: body.status,
        resourceName: resource.name,
        subscriptionId: resource.subscriptionId,
        subscriptionName,
        monthlyCost: resource.mtdCost,
        currency: resource.currency,
      });
      return json(report);
    } catch (err) {
      return { status: 400, jsonBody: { message: (err as Error).message } };
    }
  }),
});

app.http("setDeletionStatusBulk", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "deletion-status/bulk",
  handler: withAuth(async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const body = (await req.json()) as { resourceIds?: unknown; status?: unknown };
      if (!Array.isArray(body?.resourceIds) || body.resourceIds.length === 0 || !body.resourceIds.every((id) => typeof id === "string")) {
        throw new Error("resourceIds inválido: esperado uma lista de strings não vazia");
      }
      const resourceIds = body.resourceIds as string[];

      const candidates = await readJsonBlob<DeletionCandidatesReport>(CURATED_CONTAINER, "deletion-candidates.json");
      const summary = await loadSummary();
      const subscriptionName = (subscriptionId: string) =>
        summary?.bySubscription.find((s) => s.subscriptionId === subscriptionId)?.subscriptionName ?? subscriptionId;

      const inputs = resourceIds.map((resourceId) => {
        const resource = candidates?.resources.find((r) => r.resourceId.toLowerCase() === resourceId.toLowerCase());
        if (!resource) throw new Error(`Recurso não encontrado em deletion-candidates.json: ${resourceId}`);
        return {
          resourceId: resource.resourceId,
          status: body.status,
          resourceName: resource.name,
          subscriptionId: resource.subscriptionId,
          subscriptionName: subscriptionName(resource.subscriptionId),
          monthlyCost: resource.mtdCost,
          currency: resource.currency,
        };
      });

      const report = await setDeletionStatusBulk(inputs);
      return json(report);
    } catch (err) {
      return { status: 400, jsonBody: { message: (err as Error).message } };
    }
  }),
});

app.http("getDeletionStatusHistory", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "deletion-status-history",
  handler: withAuth(async (): Promise<HttpResponseInit> => {
    const report = await readDeletionStatuses();
    return json({ updatedAt: report.updatedAt, history: report.history });
  }),
});

app.http("refreshDeletionSavingsOnDemand", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "deletion-status-history/refresh",
  handler: withAuth(async (): Promise<HttpResponseInit> => {
    const report = await refreshDeletionSavingsNow();
    return json({ updatedAt: report.updatedAt, history: report.history });
  }),
});

app.http("getVersion", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "version",
  handler: withAuth(async (): Promise<HttpResponseInit> => json(getVersionInfo())),
});

app.http("getAiInsights", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "ai-insights",
  handler: withAuth(async (): Promise<HttpResponseInit> => {
    const report = await readJsonBlob<AiInsightsReport>(CURATED_CONTAINER, "ai-insights.json");
    return report ? json(report) : notReady();
  }),
});

app.http("refreshAiInsightsOnDemand", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "ai-insights/refresh",
  handler: withAuth(async (_req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const report = await refreshAiInsightsNow((message) => context.warn(message));
    return json(report);
  }),
});

app.http("getServiceTargets", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "service-targets",
  handler: withAuth(async (): Promise<HttpResponseInit> => {
    return json(await readServiceTargets());
  }),
});

app.http("setServiceTargets", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "service-targets",
  handler: withAuth(async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const body = (await req.json()) as { targets?: unknown };
      const report = await writeServiceTargets(body?.targets);
      return json(report);
    } catch (err) {
      return { status: 400, jsonBody: { message: (err as Error).message } };
    }
  }),
});

app.http("getIncentiveSubscriptions", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "incentive-subscriptions",
  handler: withAuth(async (): Promise<HttpResponseInit> => {
    return json(await readIncentiveSubscriptions());
  }),
});

app.http("setIncentiveSubscriptions", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "incentive-subscriptions",
  handler: withAuth(async (req: HttpRequest): Promise<HttpResponseInit> => {
    try {
      const body = (await req.json()) as { subscriptions?: unknown };
      const report = await writeIncentiveSubscriptions(body?.subscriptions);
      return json(report);
    } catch (err) {
      return { status: 400, jsonBody: { message: (err as Error).message } };
    }
  }),
});
