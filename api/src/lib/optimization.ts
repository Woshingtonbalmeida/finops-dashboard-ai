import { DefaultAzureCredential } from "@azure/identity";

const credential = new DefaultAzureCredential();

async function getManagementToken(): Promise<string> {
  const token = await credential.getToken("https://management.azure.com/.default");
  if (!token) throw new Error("Não foi possível obter token de acesso para management.azure.com");
  return token.token;
}

async function getJson<T>(url: string): Promise<T> {
  const token = await getManagementToken();
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    throw new Error(`GET ${url} -> ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as T;
}

// The Advisor API returns one recommendation object per affected resource, so the
// same recommendation type (e.g. "Consider reserved instance...") shows up dozens of
// times. The Azure portal groups these by recommendationTypeId into one row with an
// affected-resource count, which is far more useful — we do the same here.
export interface AdvisorRecommendationGroup {
  recommendationTypeId: string;
  problem: string;
  subCategory: string;
  impact: string;
  affectedResourceCount: number;
  subscriptionIds: string[];
  totalAnnualSavings: number;
  currency: string;
  /** totalAnnualSavings converted to the billing currency, using fxRateToBilling */
  totalAnnualSavingsBilling: number;
  billingCurrency: string;
}

interface AdvisorApiResponse {
  nextLink?: string;
  value: {
    properties: {
      recommendationTypeId: string;
      impact: string;
      shortDescription: { problem: string };
      extendedProperties?: Record<string, string>;
      resourceMetadata: { resourceId: string };
    };
  }[];
}

interface RawAdvisorItem {
  subscriptionId: string;
  recommendationTypeId: string;
  impact: string;
  problem: string;
  subCategory: string;
  annualSavings: number;
  currency: string;
}

async function fetchRawAdvisorItems(subscriptionId: string): Promise<RawAdvisorItem[]> {
  const results: RawAdvisorItem[] = [];
  let url: string | undefined =
    `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.Advisor/recommendations?api-version=2023-01-01&$filter=Category%20eq%20%27Cost%27`;

  while (url) {
    const page: AdvisorApiResponse = await getJson(url);
    for (const item of page.value) {
      const ext = item.properties.extendedProperties ?? {};
      results.push({
        subscriptionId,
        recommendationTypeId: item.properties.recommendationTypeId,
        impact: item.properties.impact,
        problem: item.properties.shortDescription.problem,
        subCategory: ext.recommendationSubCategory ?? "Other",
        annualSavings: parseFloat(ext.annualSavingsAmount ?? "0") || 0,
        currency: ext.savingsCurrency ?? "USD",
      });
    }
    url = page.nextLink;
  }
  return results;
}

// Advisor reports savings in USD regardless of the account's billing currency, so we
// reuse the FX rate implied by the account's own reservation invoices (see
// deriveFxRateFromReservations) to show a billing-currency figure alongside it,
// instead of calling out to an external FX rate API.
export async function fetchAdvisorRecommendations(
  subscriptionIds: string[],
  fx?: { rate: number; billingCurrency: string }
): Promise<AdvisorRecommendationGroup[]> {
  const raw: RawAdvisorItem[] = [];
  for (const subscriptionId of subscriptionIds) {
    raw.push(...(await fetchRawAdvisorItems(subscriptionId)));
  }

  const groups = new Map<string, AdvisorRecommendationGroup>();
  for (const item of raw) {
    const existing = groups.get(item.recommendationTypeId);
    if (existing) {
      existing.affectedResourceCount += 1;
      existing.totalAnnualSavings += item.annualSavings;
      if (!existing.subscriptionIds.includes(item.subscriptionId)) {
        existing.subscriptionIds.push(item.subscriptionId);
      }
    } else {
      groups.set(item.recommendationTypeId, {
        recommendationTypeId: item.recommendationTypeId,
        problem: item.problem,
        subCategory: item.subCategory,
        impact: item.impact,
        affectedResourceCount: 1,
        subscriptionIds: [item.subscriptionId],
        totalAnnualSavings: item.annualSavings,
        currency: item.currency,
        totalAnnualSavingsBilling: 0,
        billingCurrency: fx?.billingCurrency ?? item.currency,
      });
    }
  }

  const result = [...groups.values()];
  for (const group of result) {
    group.totalAnnualSavingsBilling = fx ? group.totalAnnualSavings * fx.rate : group.totalAnnualSavings;
  }
  return result.sort((a, b) => b.totalAnnualSavingsBilling - a.totalAnnualSavingsBilling);
}

/** Derives an average USD -> billing-currency FX rate from reservations' most recent paid installments. */
export function deriveFxRateFromReservations(
  reservations: ReservationSummary[]
): { rate: number; billingCurrency: string } | undefined {
  const withRate = reservations.filter((r) => r.termTotalAmount > 0 && r.termTotalCurrency === "USD");
  if (withRate.length === 0) return undefined;
  const avgRate =
    withRate.reduce((sum, r) => sum + r.termTotalAmountBilling / r.termTotalAmount, 0) / withRate.length;
  return { rate: avgRate, billingCurrency: withRate[0].billingCurrency };
}

export interface ReservationAppliedResource {
  resourceId: string;
  resourceName: string;
  resourceGroup: string;
  subscriptionId: string;
  /** Days within the lookback window this resource drew from the reservation */
  daysActive: number;
  usedHours: number;
}

export interface ReservationSummary {
  orderId: string;
  displayName: string;
  term: string;
  quantity: number;
  billingPlan: string;
  provisioningState: string;
  expiryDate: string;
  /** Total contract price for the whole term, in the reservation's pricing currency (usually USD) */
  termTotalAmount: number;
  termTotalCurrency: string;
  /** Same total converted to the billing currency (BRL), using the FX rate from the most recent paid installment */
  termTotalAmountBilling: number;
  billingCurrency: string;
  /** Recurring monthly charge, in the billing currency — undefined for upfront (single-payment) plans */
  monthlyAmountBilling?: number;
  /** Distinct resources that drew from this reservation in the last 30 days — reservations
   * aren't pinned to one resource, Azure applies them to whichever eligible resource needs
   * capacity that day, so this can (and does) shift day to day. */
  appliedResources: ReservationAppliedResource[];
}

interface ReservationOrdersApiResponse {
  value: {
    name: string;
    properties: {
      displayName: string;
      term: string;
      originalQuantity: number;
      billingPlan: string;
      provisioningState: string;
      expiryDate: string;
    };
  }[];
}

interface ReservationTransaction {
  status: string;
  pricingCurrencyTotal?: { amount: number; currencyCode: string };
  billingCurrencyTotal?: { amount: number; currencyCode: string };
}

interface ReservationOrderDetail {
  properties: {
    planInformation?: {
      pricingCurrencyTotal?: { amount: number; currencyCode: string };
      transactions?: ReservationTransaction[];
    };
  };
}

interface ReservationDetailsApiResponse {
  nextLink?: string | null;
  value: {
    properties: {
      instanceId: string;
      usedHours: number;
    };
  }[];
}

function parseInstanceId(instanceId: string): { resourceName: string; resourceGroup: string; subscriptionId: string } {
  const parts = instanceId.split("/").filter(Boolean);
  const subIdx = parts.indexOf("subscriptions");
  const rgIdx = parts.indexOf("resourcegroups");
  return {
    resourceName: parts[parts.length - 1] ?? instanceId,
    resourceGroup: rgIdx >= 0 ? parts[rgIdx + 1] : "",
    subscriptionId: subIdx >= 0 ? parts[subIdx + 1] : "",
  };
}

// Reservations aren't pinned to one resource — Azure applies the reservation's capacity to
// whichever eligible resource in scope needs it that day, so "which resource is this applied
// to" only makes sense as "which resources drew from it recently", not a fixed assignment.
async function fetchAppliedResources(orderId: string): Promise<ReservationAppliedResource[]> {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 30);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const filter = encodeURIComponent(`properties/UsageDate ge ${fmt(start)} and properties/UsageDate le ${fmt(end)}`);

  const byInstance = new Map<string, { daysActive: number; usedHours: number }>();
  let url: string | null =
    `https://management.azure.com/providers/Microsoft.Capacity/reservationOrders/${orderId}/providers/Microsoft.Consumption/reservationDetails?api-version=2023-05-01&$filter=${filter}`;
  while (url) {
    const page: ReservationDetailsApiResponse = await getJson(url);
    for (const row of page.value) {
      const key = row.properties.instanceId;
      if (!key) continue;
      const entry = byInstance.get(key) ?? { daysActive: 0, usedHours: 0 };
      entry.daysActive += 1;
      entry.usedHours += row.properties.usedHours;
      byInstance.set(key, entry);
    }
    url = page.nextLink ?? null;
  }

  return [...byInstance.entries()]
    .map(([resourceId, v]) => ({ resourceId, ...parseInstanceId(resourceId), ...v }))
    .sort((a, b) => b.usedHours - a.usedHours);
}

export interface OptimizationReport {
  generatedAt: string;
  advisorRecommendations: AdvisorRecommendationGroup[];
  reservations: ReservationSummary[];
  savingsPlans: SavingsPlanSummary[];
}

export async function fetchReservations(): Promise<ReservationSummary[]> {
  const page: ReservationOrdersApiResponse = await getJson(
    "https://management.azure.com/providers/Microsoft.Capacity/reservationOrders?api-version=2022-11-01"
  );

  const summaries: ReservationSummary[] = [];
  for (const o of page.value) {
    let termTotalAmount = 0;
    let termTotalCurrency = "USD";
    let termTotalAmountBilling = 0;
    let billingCurrency = "BRL";
    let monthlyAmountBilling: number | undefined;
    try {
      const detail: ReservationOrderDetail = await getJson(
        `https://management.azure.com/providers/Microsoft.Capacity/reservationOrders/${o.name}?api-version=2022-11-01&$expand=schedule`
      );
      const plan = detail.properties.planInformation;
      const total = plan?.pricingCurrencyTotal;
      if (total) {
        termTotalAmount = total.amount;
        termTotalCurrency = total.currencyCode;
      }

      // Only paid installments have a locked-in FX rate; use the most recent one to
      // convert the (fixed) contract total into the billing currency for display.
      const paidTransactions = (plan?.transactions ?? []).filter(
        (t) => t.status === "Completed" && t.pricingCurrencyTotal && t.billingCurrencyTotal
      );
      const lastPaid = paidTransactions[paidTransactions.length - 1];
      if (lastPaid?.pricingCurrencyTotal && lastPaid.billingCurrencyTotal) {
        const fxRate = lastPaid.billingCurrencyTotal.amount / lastPaid.pricingCurrencyTotal.amount;
        termTotalAmountBilling = termTotalAmount * fxRate;
        billingCurrency = lastPaid.billingCurrencyTotal.currencyCode;
        if (o.properties.billingPlan === "Monthly") {
          monthlyAmountBilling = lastPaid.billingCurrencyTotal.amount;
        }
      } else if (total) {
        // No paid installment yet (e.g. brand-new upfront purchase): fall back to the
        // pricing-currency total, unconverted.
        termTotalAmountBilling = total.amount;
        billingCurrency = total.currencyCode;
      }
    } catch {
      // pricing detail is best-effort; keep the reservation with zeroed amounts if it fails
    }

    let appliedResources: ReservationAppliedResource[] = [];
    try {
      appliedResources = await fetchAppliedResources(o.name);
    } catch {
      // applied-resources detail is best-effort; keep the reservation with an empty list if it fails
    }

    summaries.push({
      orderId: o.name,
      displayName: o.properties.displayName,
      term: o.properties.term,
      quantity: o.properties.originalQuantity,
      billingPlan: o.properties.billingPlan,
      provisioningState: o.properties.provisioningState,
      expiryDate: o.properties.expiryDate,
      termTotalAmount,
      termTotalCurrency,
      termTotalAmountBilling,
      billingCurrency,
      monthlyAmountBilling,
      appliedResources,
    });
  }
  return summaries;
}

export interface SavingsPlanSummary {
  orderId: string;
  displayName: string;
  term: string;
  commitmentAmount: number;
  commitmentCurrency: string;
  provisioningState: string;
}

interface SavingsPlanOrdersApiResponse {
  value: {
    name: string;
    properties: {
      displayName: string;
      term: string;
      provisioningState: string;
      benefitStartTime?: string;
      savingsPlans?: { properties?: { commitment?: { amount: number; currencyCode: string } } }[];
    };
  }[];
}

export async function fetchSavingsPlans(): Promise<SavingsPlanSummary[]> {
  const page: SavingsPlanOrdersApiResponse = await getJson(
    "https://management.azure.com/providers/Microsoft.BillingBenefits/savingsPlanOrders?api-version=2022-11-01"
  );
  return page.value.map((o) => {
    const commitment = o.properties.savingsPlans?.[0]?.properties?.commitment;
    return {
      orderId: o.name,
      displayName: o.properties.displayName,
      term: o.properties.term,
      commitmentAmount: commitment?.amount ?? 0,
      commitmentCurrency: commitment?.currencyCode ?? "USD",
      provisioningState: o.properties.provisioningState,
    };
  });
}
