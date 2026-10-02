import { parse } from "csv-parse/sync";

export interface FocusRow {
  chargePeriodStart: Date;
  effectiveCost: number;
  currency: string;
  subscriptionId: string;
  subscriptionName: string;
  serviceName: string;
  resourceGroup: string;
  resourceId: string;
  resourceName: string;
  tags: Record<string, string>;
  // AI/LLM-specific meter detail (x_Sku* extension columns) — only meaningful when
  // skuMeterCategory is "Foundry Models" (Azure OpenAI token consumption); empty otherwise.
  skuMeterCategory: string;
  skuMeterName: string;
  skuMeterSubcategory: string;
  consumedQuantity: number;
}

export interface MonthlySubscriptionCost {
  yearMonth: string;
  subscriptionId: string;
  subscriptionName: string;
  cost: number;
}

export interface ServiceSubscriptionCost {
  subscriptionId: string;
  subscriptionName: string;
  service: string;
  cost: number;
  forecast: number;
}

export interface CostAnomaly {
  date: string;
  subscriptionId: string;
  subscriptionName: string;
  service: string;
  actualCost: number;
  baselineCost: number;
  deviationPercent: number | null; // null when the 7-day baseline was 0 (a new cost, not a "spike")
  deviationAmount: number;
}

export interface WeeklyCascadeMover {
  subscriptionId: string;
  subscriptionName: string;
  service: string;
  thisWeekCost: number;
  lastWeekCost: number;
  delta: number;
}

export interface WeeklyReport {
  thisWeekCost: number;
  lastWeekCost: number;
  variancePercent: number | null;
  currency: string;
  topIncreases: WeeklyCascadeMover[];
  topDecreases: WeeklyCascadeMover[];
}

export type AiTokenType = "input" | "output" | "cached-input" | "outro";

export interface AiUsageByResource {
  resourceId: string;
  resourceName: string;
  subscriptionId: string;
  subscriptionName: string;
  cost: number;
  tokens: number;
}

export interface AiUsageByModel {
  model: string;
  tokenType: AiTokenType;
  cost: number;
  tokens: number;
}

export interface AiUsageMonth {
  yearMonth: string;
  cost: number;
  tokens: number;
}

export interface AiUsageReport {
  generatedAt: string;
  currency: string;
  totalMtdCost: number;
  totalMtdTokens: number;
  totalMtdForecast: number;
  /** Prior month's cost up to the same day-of-month as today — comparable to totalMtdCost
   *  without the "full month vs partial month" skew a raw prior-month total would have. */
  totalPriorMonthCostToDate: number;
  byResource: AiUsageByResource[];
  byModel: AiUsageByModel[];
  monthly: AiUsageMonth[];
}

export interface CuratedSummary {
  generatedAt: string;
  currency: string;
  totalMtdCost: number;
  totalPriorMonthCost: number;
  // Prior month's cost through the same day-of-month as "now" — e.g. if today is Aug 5,
  // this is Jul 1-5, not all of July. Comparing totalMtdCost (a partial month) against the
  // FULL totalPriorMonthCost overstates any "drop" early in the month simply because the
  // current month hasn't had time to accumulate yet; this is the apples-to-apples figure
  // for the "vs. mês anterior" delta. totalPriorMonthCost itself is kept as-is since it's
  // also shown standalone as "last month's total spend", where the full month is correct.
  totalPriorMonthCostToDate: number;
  bySubscription: { subscriptionId: string; subscriptionName: string; cost: number }[];
  byService: { service: string; cost: number; forecast: number }[];
  byResourceGroup: { subscriptionId: string; resourceGroup: string; cost: number }[];
  byTag: { tagKey: string; tagValue: string; cost: number }[];
  // Per-resource detail (mês corrente) used by the "Custos por tags" export, one row per
  // (resource, tagKey, tagValue) — same accounting as byTag above (cost summed per day
  // under whichever value that tag had that day) but keeping resource identity, so a
  // resource whose tag changed mid-month shows up once per value it held, each with only
  // that period's cost. This is what makes an export filtered to one tagKey sum to
  // exactly the same total as byTag for that key; collapsing to "whatever the tag is now"
  // would silently misattribute cost for any resource retagged partway through the month.
  taggedResources: {
    resourceId: string;
    resourceName: string;
    resourceGroup: string;
    subscriptionId: string;
    subscriptionName: string;
    service: string;
    tagKey: string;
    tagValue: string;
    cost: number;
  }[];
  trend: { date: string; cost: number; bySubscription: { subscriptionId: string; subscriptionName: string; cost: number }[] }[];
  monthlyBySubscription: MonthlySubscriptionCost[];
  byServiceBySubscription: ServiceSubscriptionCost[];
  anomalies: CostAnomaly[];
  weeklyReport: WeeklyReport;
  aiUsage: AiUsageReport;
}

// Azure FOCUS exports may name the Azure-specific resource-group extension column
// slightly differently across dataset versions, so we try a few known aliases.
const RESOURCE_GROUP_ALIASES = ["x_ResourceGroupName", "x_ResourceGroupId", "ResourceGroupName"];

function pick(row: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== "") return row[key];
  }
  return "";
}

function resourceGroupFromResourceId(resourceId: string): string {
  const match = /\/resourceGroups\/([^/]+)/i.exec(resourceId);
  return match ? match[1] : "(sem resource group)";
}

// Auto-generated tags from AKS/Kubernetes/Databricks/App Insights that clutter the tag
// picker without being useful for cost allocation — filtered out at parse time.
const SYSTEM_TAG_PREFIXES = ["aks-managed", "hidden-", "k8s-azure", "kubernetes.io", "databricks"];
const SYSTEM_TAG_EXACT = new Set(["compute.aks.billing", "hidden-workload-type"]);

function isSystemTag(key: string): boolean {
  const lower = key.toLowerCase();
  if (SYSTEM_TAG_EXACT.has(lower)) return true;
  return SYSTEM_TAG_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

// FOCUS's Tags column is a JSON-encoded object of resource tags; tolerate missing/malformed values.
function parseTags(raw: string): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const tags: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === "string" && value !== "" && !isSystemTag(key)) tags[key] = value;
      }
      return tags;
    }
  } catch {
    // not valid JSON — ignore
  }
  return {};
}

// FOCUS's SubAccountId is the full ARM resource ID ("/subscriptions/{guid}"), while
// every other data source we join against (Advisor, Budgets, Forecast, Reservations)
// keys by the bare GUID — normalize here so subscriptionId matches everywhere.
function bareSubscriptionId(subAccountId: string): string {
  const match = /\/subscriptions\/([^/]+)/i.exec(subAccountId);
  return match ? match[1] : subAccountId;
}

export function parseFocusCsv(csvText: string): FocusRow[] {
  const records: Record<string, string>[] = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });

  return records.map((row) => {
    const resourceId = pick(row, ["ResourceId"]);
    const resourceGroup = pick(row, RESOURCE_GROUP_ALIASES) || resourceGroupFromResourceId(resourceId);

    const effectiveCost = parseFloat(pick(row, ["EffectiveCost", "BilledCost", "ListCost"])) || 0;

    return {
      chargePeriodStart: new Date(pick(row, ["ChargePeriodStart", "BillingPeriodStart"])),
      effectiveCost,
      currency: pick(row, ["BillingCurrency"]) || "USD",
      subscriptionId: bareSubscriptionId(pick(row, ["SubAccountId"])),
      subscriptionName: pick(row, ["SubAccountName"]) || pick(row, ["SubAccountId"]),
      serviceName: pick(row, ["ServiceName", "ServiceCategory"]) || "(desconhecido)",
      resourceGroup,
      resourceId,
      resourceName: pick(row, ["ResourceName"]),
      tags: parseTags(pick(row, ["Tags"])),
      skuMeterCategory: pick(row, ["x_SkuMeterCategory"]),
      skuMeterName: pick(row, ["x_SkuMeterName"]),
      skuMeterSubcategory: pick(row, ["x_SkuMeterSubcategory"]),
      consumedQuantity: parseFloat(pick(row, ["ConsumedQuantity"])) || 0,
    };
  });
}

function isSameMonth(date: Date, reference: Date): boolean {
  return date.getUTCFullYear() === reference.getUTCFullYear() && date.getUTCMonth() === reference.getUTCMonth();
}

function isPriorMonth(date: Date, reference: Date): boolean {
  const priorMonth = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() - 1, 1));
  return isSameMonth(date, priorMonth);
}

// Azure OpenAI's x_SkuMeterName follows no fixed schema — real examples seen: "GPT 5.2 opt Gl
// 1M Tokens" (output — "opt" here is short for "output", not "optional"), "5.4 mini cd Inp Gl
// 1M Tokens" / "GPT 5 Mini cchd Inpt Glbl 1M Tokens" (cached input, two different abbreviations
// for "cached"), "GPT 5.2 inp Gl 1M Tokens" (plain input). This is a heuristic on the
// abbreviations Microsoft actually uses, not a documented enum — cached must be checked before
// plain input since "cd inp"/"cchd inpt" both also match /inp/.
function classifyTokenType(meterName: string): AiTokenType {
  const lower = meterName.toLowerCase();
  if (/\bcd\s*inp|cchd\s*inp|cached/.test(lower)) return "cached-input";
  if (/\bopt\b|\boutp/.test(lower)) return "output";
  if (/\binp/.test(lower)) return "input";
  return "outro";
}

export function aggregateFocusRows(rows: FocusRow[], now: Date = new Date()): CuratedSummary {
  const currency = rows.find((r) => r.currency)?.currency ?? "USD";

  let totalMtdCost = 0;
  let totalPriorMonthCost = 0;
  let totalPriorMonthCostToDate = 0;
  const bySubscription = new Map<string, { subscriptionName: string; cost: number }>();
  const byService = new Map<string, number>();
  const byServiceBySubscription = new Map<string, Omit<ServiceSubscriptionCost, "forecast">>();
  const byResourceGroup = new Map<string, { subscriptionId: string; resourceGroup: string; cost: number }>();
  const byTag = new Map<string, { tagKey: string; tagValue: string; cost: number }>();
  const taggedResources = new Map<
    string, // `${resourceId}::${tagKey}::${tagValue}`
    {
      resourceId: string;
      resourceName: string;
      resourceGroup: string;
      subscriptionId: string;
      subscriptionName: string;
      service: string;
      tagKey: string;
      tagValue: string;
      cost: number;
    }
  >();
  const trendCutoff = new Date(now);
  trendCutoff.setUTCDate(trendCutoff.getUTCDate() - 60);
  const trend = new Map<string, number>();
  const trendBySubscription = new Map<string, Map<string, { subscriptionName: string; cost: number }>>();

  // Current calendar month plus the two before it (e.g. now=Jul -> May, Jun, Jul).
  const monthWindowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
  const monthlyBySubscription = new Map<string, { yearMonth: string; subscriptionId: string; subscriptionName: string; cost: number }>();

  const anomalyWindowStart = new Date(now);
  anomalyWindowStart.setUTCDate(anomalyWindowStart.getUTCDate() - 30);
  const dailyByServiceSubscription = new Map<
    string,
    { subscriptionId: string; subscriptionName: string; service: string; byDate: Map<string, number> }
  >();

  // Azure OpenAI (Foundry Models) token consumption — separate from the byService/byResourceGroup
  // breakdowns above since it needs the x_Sku* meter columns those don't carry.
  const AI_METER_CATEGORY = "Foundry Models";
  let aiTotalMtdCost = 0;
  let aiTotalMtdTokens = 0;
  let aiTotalPriorMonthCostToDate = 0;
  const aiByResource = new Map<string, AiUsageByResource>();
  const aiByModel = new Map<string, AiUsageByModel>();
  const aiMonthly = new Map<string, AiUsageMonth>();

  for (const row of rows) {
    if (isNaN(row.chargePeriodStart.getTime())) continue;

    if (isSameMonth(row.chargePeriodStart, now)) {
      totalMtdCost += row.effectiveCost;

      const sub = bySubscription.get(row.subscriptionId) ?? { subscriptionName: row.subscriptionName, cost: 0 };
      sub.cost += row.effectiveCost;
      bySubscription.set(row.subscriptionId, sub);

      byService.set(row.serviceName, (byService.get(row.serviceName) ?? 0) + row.effectiveCost);

      const svcSubKey = `${row.subscriptionId}|${row.serviceName}`;
      const svcSub = byServiceBySubscription.get(svcSubKey) ?? {
        subscriptionId: row.subscriptionId,
        subscriptionName: row.subscriptionName,
        service: row.serviceName,
        cost: 0,
      };
      svcSub.cost += row.effectiveCost;
      byServiceBySubscription.set(svcSubKey, svcSub);

      const rgKey = `${row.subscriptionId}|${row.resourceGroup}`;
      const rg = byResourceGroup.get(rgKey) ?? {
        subscriptionId: row.subscriptionId,
        resourceGroup: row.resourceGroup,
        cost: 0,
      };
      rg.cost += row.effectiveCost;
      byResourceGroup.set(rgKey, rg);

      for (const [tagKey, tagValue] of Object.entries(row.tags)) {
        const tagMapKey = `${tagKey}::${tagValue}`;
        const tag = byTag.get(tagMapKey) ?? { tagKey, tagValue, cost: 0 };
        tag.cost += row.effectiveCost;
        byTag.set(tagMapKey, tag);

        // One bucket per (resource, tagKey, tagValue) — same accounting as byTag above,
        // just keeping resource identity too, so a resource retagged mid-month lands in
        // two buckets for that tag key, each holding only the cost from the days it
        // actually had that value (instead of misattributing the whole month to
        // whichever value happened to be current at the end).
        const resTagKey = `${row.resourceId.toLowerCase()}::${tagKey}::${tagValue}`;
        const resTag = taggedResources.get(resTagKey) ?? {
          resourceId: row.resourceId,
          resourceName: row.resourceName,
          resourceGroup: row.resourceGroup,
          subscriptionId: row.subscriptionId,
          subscriptionName: row.subscriptionName,
          service: row.serviceName,
          tagKey,
          tagValue,
          cost: 0,
        };
        resTag.cost += row.effectiveCost;
        taggedResources.set(resTagKey, resTag);
      }
    } else if (isPriorMonth(row.chargePeriodStart, now)) {
      totalPriorMonthCost += row.effectiveCost;
      if (row.chargePeriodStart.getUTCDate() <= now.getUTCDate()) {
        totalPriorMonthCostToDate += row.effectiveCost;
      }
    }

    if (row.chargePeriodStart >= trendCutoff) {
      const dateKey = row.chargePeriodStart.toISOString().slice(0, 10);
      trend.set(dateKey, (trend.get(dateKey) ?? 0) + row.effectiveCost);

      const daySubs = trendBySubscription.get(dateKey) ?? new Map<string, { subscriptionName: string; cost: number }>();
      const subEntry = daySubs.get(row.subscriptionId) ?? { subscriptionName: row.subscriptionName, cost: 0 };
      subEntry.cost += row.effectiveCost;
      daySubs.set(row.subscriptionId, subEntry);
      trendBySubscription.set(dateKey, daySubs);
    }

    if (row.chargePeriodStart >= monthWindowStart) {
      const yearMonth = `${row.chargePeriodStart.getUTCFullYear()}-${String(row.chargePeriodStart.getUTCMonth() + 1).padStart(2, "0")}`;
      const key = `${yearMonth}|${row.subscriptionId}`;
      const entry = monthlyBySubscription.get(key) ?? {
        yearMonth,
        subscriptionId: row.subscriptionId,
        subscriptionName: row.subscriptionName,
        cost: 0,
      };
      entry.cost += row.effectiveCost;
      monthlyBySubscription.set(key, entry);
    }

    if (row.chargePeriodStart >= anomalyWindowStart) {
      const dateKey = row.chargePeriodStart.toISOString().slice(0, 10);
      const key = `${row.subscriptionId}|${row.serviceName}`;
      const entry = dailyByServiceSubscription.get(key) ?? {
        subscriptionId: row.subscriptionId,
        subscriptionName: row.subscriptionName,
        service: row.serviceName,
        byDate: new Map<string, number>(),
      };
      entry.byDate.set(dateKey, (entry.byDate.get(dateKey) ?? 0) + row.effectiveCost);
      dailyByServiceSubscription.set(key, entry);
    }

    if (row.skuMeterCategory === AI_METER_CATEGORY) {
      const yearMonth = `${row.chargePeriodStart.getUTCFullYear()}-${String(row.chargePeriodStart.getUTCMonth() + 1).padStart(2, "0")}`;
      const monthEntry = aiMonthly.get(yearMonth) ?? { yearMonth, cost: 0, tokens: 0 };
      monthEntry.cost += row.effectiveCost;
      monthEntry.tokens += row.consumedQuantity;
      aiMonthly.set(yearMonth, monthEntry);

      if (isSameMonth(row.chargePeriodStart, now)) {
        aiTotalMtdCost += row.effectiveCost;
        aiTotalMtdTokens += row.consumedQuantity;

        const resEntry = aiByResource.get(row.resourceId) ?? {
          resourceId: row.resourceId,
          resourceName: row.resourceName,
          subscriptionId: row.subscriptionId,
          subscriptionName: row.subscriptionName,
          cost: 0,
          tokens: 0,
        };
        resEntry.cost += row.effectiveCost;
        resEntry.tokens += row.consumedQuantity;
        aiByResource.set(row.resourceId, resEntry);

        const tokenType = classifyTokenType(row.skuMeterName);
        const modelKey = `${row.skuMeterSubcategory}|${tokenType}`;
        const modelEntry = aiByModel.get(modelKey) ?? { model: row.skuMeterSubcategory || "(modelo desconhecido)", tokenType, cost: 0, tokens: 0 };
        modelEntry.cost += row.effectiveCost;
        modelEntry.tokens += row.consumedQuantity;
        aiByModel.set(modelKey, modelEntry);
      } else if (isPriorMonth(row.chargePeriodStart, now) && row.chargePeriodStart.getUTCDate() <= now.getUTCDate()) {
        aiTotalPriorMonthCostToDate += row.effectiveCost;
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    currency,
    totalMtdCost: round2(totalMtdCost),
    totalPriorMonthCost: round2(totalPriorMonthCost),
    totalPriorMonthCostToDate: round2(totalPriorMonthCostToDate),
    bySubscription: [...bySubscription.entries()]
      .map(([subscriptionId, v]) => ({ subscriptionId, subscriptionName: v.subscriptionName, cost: round2(v.cost) }))
      .sort((a, b) => b.cost - a.cost),
    byService: [...byService.entries()]
      .map(([service, cost]) => ({ service, cost: round2(cost), forecast: runRateForecast(cost, now) }))
      .sort((a, b) => b.cost - a.cost),
    byResourceGroup: [...byResourceGroup.values()]
      .map((v) => ({ ...v, cost: round2(v.cost) }))
      .sort((a, b) => b.cost - a.cost),
    byTag: [...byTag.values()]
      .map((v) => ({ ...v, cost: round2(v.cost) }))
      .sort((a, b) => b.cost - a.cost),
    taggedResources: [...taggedResources.values()]
      .map((v) => ({ ...v, cost: round2(v.cost) }))
      .sort((a, b) => b.cost - a.cost),
    trend: [...trend.entries()]
      .map(([date, cost]) => ({
        date,
        cost: round2(cost),
        bySubscription: [...(trendBySubscription.get(date) ?? new Map()).entries()]
          .map(([subscriptionId, v]) => ({ subscriptionId, subscriptionName: v.subscriptionName, cost: round2(v.cost) }))
          .sort((a, b) => b.cost - a.cost),
      }))
      .sort((a, b) => (a.date < b.date ? -1 : 1)),
    monthlyBySubscription: [...monthlyBySubscription.values()]
      .map((v) => ({ ...v, cost: round2(v.cost) }))
      .sort((a, b) => (a.yearMonth === b.yearMonth ? a.subscriptionName.localeCompare(b.subscriptionName) : a.yearMonth < b.yearMonth ? -1 : 1)),
    byServiceBySubscription: [...byServiceBySubscription.values()]
      .map((v) => ({ ...v, cost: round2(v.cost), forecast: runRateForecast(v.cost, now) }))
      .sort((a, b) => b.cost - a.cost),
    anomalies: detectAnomalies(dailyByServiceSubscription, now),
    weeklyReport: computeWeeklyCascade(dailyByServiceSubscription, now, currency),
    aiUsage: {
      generatedAt: new Date().toISOString(),
      currency,
      totalMtdCost: round2(aiTotalMtdCost),
      totalMtdTokens: Math.round(aiTotalMtdTokens),
      totalMtdForecast: runRateForecast(aiTotalMtdCost, now),
      totalPriorMonthCostToDate: round2(aiTotalPriorMonthCostToDate),
      byResource: [...aiByResource.values()]
        .map((v) => ({ ...v, cost: round2(v.cost), tokens: Math.round(v.tokens) }))
        .sort((a, b) => b.cost - a.cost),
      byModel: [...aiByModel.values()]
        .map((v) => ({ ...v, cost: round2(v.cost), tokens: Math.round(v.tokens) }))
        .sort((a, b) => b.cost - a.cost),
      monthly: [...aiMonthly.values()]
        .map((v) => ({ ...v, cost: round2(v.cost), tokens: Math.round(v.tokens) }))
        .sort((a, b) => (a.yearMonth < b.yearMonth ? -1 : 1)),
    },
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// Simple run-rate projection (MTD cost / days elapsed * days in month) — not Azure's own
// forecast model, but consistent with the rest of the dashboard since it's derived from
// the same FOCUS rows, and cheap enough to compute per service without extra API calls.
function runRateForecast(mtdCost: number, now: Date): number {
  const daysElapsed = Math.max(1, now.getUTCDate());
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  return round2((mtdCost / daysElapsed) * daysInMonth);
}

const ANOMALY_BASELINE_DAYS = 7;
const ANOMALY_EVAL_DAYS = 23; // window (30) minus baseline (7), so every evaluated day has a full baseline
const ANOMALY_MIN_PERCENT = 0.5; // must be at least 50% above the 7-day average...
const ANOMALY_MIN_AMOUNT = 100; // ...and at least R$/US$100 above it, to ignore noise from tiny services

function detectAnomalies(
  daily: Map<string, { subscriptionId: string; subscriptionName: string; service: string; byDate: Map<string, number> }>,
  now: Date,
): CostAnomaly[] {
  const dateKey = (d: Date) => d.toISOString().slice(0, 10);
  const anomalies: CostAnomaly[] = [];

  for (const entry of daily.values()) {
    for (let offset = ANOMALY_EVAL_DAYS - 1; offset >= 0; offset--) {
      const day = new Date(now);
      day.setUTCDate(day.getUTCDate() - offset);
      const actual = entry.byDate.get(dateKey(day)) ?? 0;

      let baselineSum = 0;
      for (let b = 1; b <= ANOMALY_BASELINE_DAYS; b++) {
        const baselineDay = new Date(day);
        baselineDay.setUTCDate(baselineDay.getUTCDate() - b);
        baselineSum += entry.byDate.get(dateKey(baselineDay)) ?? 0;
      }
      const baseline = baselineSum / ANOMALY_BASELINE_DAYS;
      const deviationAmount = actual - baseline;
      const deviationPercent = baseline > 0 ? deviationAmount / baseline : null;

      const isAnomaly =
        deviationAmount >= ANOMALY_MIN_AMOUNT && (deviationPercent === null || deviationPercent >= ANOMALY_MIN_PERCENT);

      if (isAnomaly) {
        anomalies.push({
          date: dateKey(day),
          subscriptionId: entry.subscriptionId,
          subscriptionName: entry.subscriptionName,
          service: entry.service,
          actualCost: round2(actual),
          baselineCost: round2(baseline),
          deviationPercent: deviationPercent === null ? null : round2(deviationPercent * 100),
          deviationAmount: round2(deviationAmount),
        });
      }
    }
  }

  return anomalies.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : b.deviationAmount - a.deviationAmount));
}

// Compares the last 7 days against the 7 days before that, per (subscription, service) —
// the "what changed" cascade for the weekly executive report. Reuses the same daily
// breakdown already tracked for anomaly detection, so no extra FOCUS parsing is needed.
function computeWeeklyCascade(
  daily: Map<string, { subscriptionId: string; subscriptionName: string; service: string; byDate: Map<string, number> }>,
  now: Date,
  currency: string,
): WeeklyReport {
  const dateKey = (d: Date) => d.toISOString().slice(0, 10);
  const sumRange = (byDate: Map<string, number>, startOffset: number, endOffset: number) => {
    let sum = 0;
    for (let offset = startOffset; offset <= endOffset; offset++) {
      const day = new Date(now);
      day.setUTCDate(day.getUTCDate() - offset);
      sum += byDate.get(dateKey(day)) ?? 0;
    }
    return sum;
  };

  const movers: WeeklyCascadeMover[] = [];
  let thisWeekTotal = 0;
  let lastWeekTotal = 0;

  for (const entry of daily.values()) {
    const thisWeek = sumRange(entry.byDate, 0, 6);
    const lastWeek = sumRange(entry.byDate, 7, 13);
    thisWeekTotal += thisWeek;
    lastWeekTotal += lastWeek;
    const delta = thisWeek - lastWeek;
    if (Math.abs(delta) > 0.01) {
      movers.push({
        subscriptionId: entry.subscriptionId,
        subscriptionName: entry.subscriptionName,
        service: entry.service,
        thisWeekCost: round2(thisWeek),
        lastWeekCost: round2(lastWeek),
        delta: round2(delta),
      });
    }
  }

  const topIncreases = movers
    .filter((m) => m.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 3);
  const topDecreases = movers
    .filter((m) => m.delta < 0)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, 3);

  const variancePercent = lastWeekTotal > 0 ? round2(((thisWeekTotal - lastWeekTotal) / lastWeekTotal) * 100) : null;

  return {
    thisWeekCost: round2(thisWeekTotal),
    lastWeekCost: round2(lastWeekTotal),
    variancePercent,
    currency,
    topIncreases,
    topDecreases,
  };
}
