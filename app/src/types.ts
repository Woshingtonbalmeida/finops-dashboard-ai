export interface VersionInfo {
  commit: string;
  buildTime: string;
}

export interface SqlServerInfo {
  name: string;
  subscriptionId: string;
  resourceGroup: string;
  location: string;
  publicNetworkAccess: string;
  minimalTlsVersion: string;
  fqdn: string;
}

export interface SqlDatabaseInfo {
  name: string;
  serverName: string;
  subscriptionId: string;
  resourceGroup: string;
  location: string;
  status: string;
  zoneRedundant: boolean;
  skuName: string;
  skuTier: string;
  skuCapacity: number | null;
  minCapacity: number | null;
  maxSizeGB: number | null;
}

export interface SqlSecurityReport {
  generatedAt: string;
  servers: SqlServerInfo[];
  databases: SqlDatabaseInfo[];
}

export interface ResizeRecommendation {
  recommendedSize: string;
  currentVCpus: number;
  currentMemoryGB: number;
  recommendedVCpus: number;
  recommendedMemoryGB: number;
  estimatedMonthlySavings: number | null;
  currency: string | null;
}

export interface AksNodePoolUtilization {
  clusterName: string;
  poolName: string;
  subscriptionId: string;
  vmSize: string;
  nodeCount: number;
  avgCpuPercent: number | null;
  avgMemoryPercent: number | null;
  scaleSetPriority: string;
  osDiskType: string;
  osDiskSku: string | null;
  resizeRecommendation: ResizeRecommendation | null;
}

export interface AppServicePlanUtilization {
  name: string;
  subscriptionId: string;
  tier: string;
  size: string;
  capacity: number;
  avgCpuPercent: number | null;
  avgMemoryPercent: number | null;
  resizeRecommendation: ResizeRecommendation | null;
}

export interface ResourceSizingReport {
  generatedAt: string;
  aksNodePools: AksNodePoolUtilization[];
  appServicePlans: AppServicePlanUtilization[];
}

export interface AiInsight {
  title: string;
  whyItMatters: string;
  suggestedAction: string;
  estimatedMonthlySavings: number | null;
  currency: string | null;
  source: string;
}

export interface AiInsightsReport {
  generatedAt: string;
  insights: AiInsight[];
  model: string;
}

export interface SubscriptionCost {
  subscriptionId: string;
  subscriptionName: string;
  cost: number;
}

export interface ServiceCost {
  service: string;
  cost: number;
  forecast: number;
}

export interface ResourceGroupCost {
  subscriptionId: string;
  resourceGroup: string;
  cost: number;
}

export interface TagCost {
  tagKey: string;
  tagValue: string;
  cost: number;
}

export interface TaggedResourceCost {
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

export interface TagsByMonthReport {
  yearMonth: string;
  currency: string;
  byTag: TagCost[];
  taggedResources: TaggedResourceCost[];
}

export interface TrendPoint {
  date: string;
  cost: number;
  bySubscription: { subscriptionId: string; subscriptionName: string; cost: number }[];
}

export interface DailyCostByMonthReport {
  yearMonth: string;
  currency: string;
  trend: TrendPoint[];
  bySubscription: { subscriptionId: string; subscriptionName: string; cost: number }[];
  byService: { service: string; cost: number }[];
}

export interface MonthlySubscriptionCost {
  yearMonth: string;
  subscriptionId: string;
  subscriptionName: string;
  cost: number;
}

export interface MonthlyHistoryEntry {
  yearMonth: string;
  subscriptionId: string;
  subscriptionName: string;
  cost: number;
  currency: string;
}

export interface MonthlyServiceCost {
  yearMonth: string;
  subscriptionId: string;
  subscriptionName: string;
  service: string;
  cost: number;
  currency: string;
}

export interface MonthlyResourceGroupCost {
  yearMonth: string;
  subscriptionId: string;
  subscriptionName: string;
  resourceGroup: string;
  cost: number;
  currency: string;
}

export interface MonthlyHistoryReport {
  generatedAt: string;
  entries: MonthlyHistoryEntry[];
  byService: MonthlyServiceCost[];
  byResourceGroup?: MonthlyResourceGroupCost[];
}

export type VarianceDimension = "service" | "resourceGroup";

export type VarianceChangeType = "Surgiu" | "Sumiu" | "Aumentou" | "Reduziu" | "Estável";

export interface VarianceNote {
  dimension: VarianceDimension;
  key: string;
  subscriptionId: string;
  fromMonth: string;
  toMonth: string;
  note: string;
  updatedAt: string;
  updatedBy: string;
}

export interface VarianceRow {
  key: string;
  subscriptionId: string;
  subscriptionName: string;
  fromCost: number;
  toCost: number;
  delta: number;
  deltaPercent: number | null;
  changeType: VarianceChangeType;
  note?: VarianceNote;
}

export interface MonthVarianceReport {
  generatedAt: string;
  fromMonth: string;
  toMonth: string;
  dimension: VarianceDimension;
  currency: string;
  fromTotal: number;
  toTotal: number;
  delta: number;
  deltaPercent: number | null;
  rows: VarianceRow[];
  availableMonths: string[];
}

export interface VarianceNotesReport {
  updatedAt: string;
  notes: VarianceNote[];
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
  deviationPercent: number | null;
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
  totalPriorMonthCostToDate: number;
  bySubscription: SubscriptionCost[];
  byService: ServiceCost[];
  byResourceGroup: ResourceGroupCost[];
  byTag: TagCost[];
  taggedResources: TaggedResourceCost[];
  trend: TrendPoint[];
  byServiceBySubscription: ServiceSubscriptionCost[];
  monthlyBySubscription: MonthlySubscriptionCost[];
  anomalies: CostAnomaly[];
  weeklyReport: WeeklyReport;
  aiUsage: AiUsageReport;
}

export interface BudgetStatus {
  subscriptionId: string;
  budgetName: string;
  amount: number;
  currentSpend: number;
  timeGrain: string;
  currency: string;
}

export interface BudgetsReport {
  generatedAt: string;
  budgets: BudgetStatus[];
}

export interface AdvisorRecommendationGroup {
  recommendationTypeId: string;
  problem: string;
  subCategory: string;
  impact: string;
  affectedResourceCount: number;
  subscriptionIds: string[];
  totalAnnualSavings: number;
  currency: string;
  totalAnnualSavingsBilling: number;
  billingCurrency: string;
}

export interface ReservationAppliedResource {
  resourceId: string;
  resourceName: string;
  resourceGroup: string;
  subscriptionId: string;
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
  termTotalAmount: number;
  termTotalCurrency: string;
  termTotalAmountBilling: number;
  billingCurrency: string;
  monthlyAmountBilling?: number;
  appliedResources: ReservationAppliedResource[];
}

export interface SavingsPlanSummary {
  orderId: string;
  displayName: string;
  term: string;
  commitmentAmount: number;
  commitmentCurrency: string;
  provisioningState: string;
}

export interface OptimizationReport {
  generatedAt: string;
  advisorRecommendations: AdvisorRecommendationGroup[];
  reservations: ReservationSummary[];
  savingsPlans: SavingsPlanSummary[];
}

export interface SubscriptionForecast {
  subscriptionId: string;
  forecastAmount: number;
  currency: string;
}

export interface ForecastReport {
  generatedAt: string;
  bySubscription: SubscriptionForecast[];
}

export interface OrphanedResource {
  resourceId: string;
  name: string;
  type: string;
  subscriptionId: string;
  resourceGroup: string;
  location: string;
  sku: string;
  mtdCost: number;
  currency: string;
}

export interface OrphanedResourcesReport {
  generatedAt: string;
  resources: OrphanedResource[];
  totalMtdCost: number;
  currency: string;
}

export interface SubscriptionTagCompliance {
  subscriptionId: string;
  totalResources: number;
  missingAnyRequiredTag: number;
  missingByTag: Record<string, number>;
}

export interface TagComplianceReport {
  generatedAt: string;
  bySubscription: SubscriptionTagCompliance[];
}

export interface WeeklyRealizedSavings {
  dailyRunRate: number;
  amount: number;
  currency: string;
}

export interface StoppedVM {
  resourceId: string;
  name: string;
  subscriptionId: string;
  resourceGroup: string;
  location: string;
  osType: string;
  vmSize: string;
  powerState: string;
  attachedDiskCount: number;
  mtdCost: number;
  currency: string;
  weeklyRealizedSavings: WeeklyRealizedSavings;
}

export interface StoppedVMHistoryEntry {
  resourceId: string;
  vmName: string;
  subscriptionId: string;
  subscriptionName: string;
  action: "Parado" | "Retomado" | "Excluído";
  changedAt: string;
  mtdCost: number;
  currency: string;
}

export interface StoppedVMsReport {
  generatedAt: string;
  vms: StoppedVM[];
  totalMtdCost: number;
  currency: string;
  history: StoppedVMHistoryEntry[];
}

export interface StoppedAksCluster {
  resourceId: string;
  name: string;
  subscriptionId: string;
  resourceGroup: string;
  location: string;
  nodeResourceGroup: string;
  tier: string;
  mtdCost: number;
  currency: string;
  weeklyRealizedSavings: WeeklyRealizedSavings;
}

export interface StoppedAksHistoryEntry {
  resourceId: string;
  clusterName: string;
  subscriptionId: string;
  subscriptionName: string;
  action: "Parado" | "Retomado" | "Excluído";
  changedAt: string;
  mtdCost: number;
  currency: string;
}

export interface StoppedAksReport {
  generatedAt: string;
  clusters: StoppedAksCluster[];
  totalMtdCost: number;
  currency: string;
  history: StoppedAksHistoryEntry[];
}

export type Severity = "High" | "Medium" | "Low";

export interface SecurityFinding {
  name: string;
  severity: Severity;
}

export interface SecurityAlert {
  name: string;
  severity: string;
  count: number;
}

export interface RegulatoryCompliance {
  standard: string;
  percent: number;
  passed: number;
  total: number;
}

export interface SubscriptionSecurity {
  subscriptionId: string;
  secureScorePercent: number;
  secureScoreCurrent: number;
  secureScoreMax: number;
  totalAssessments: number;
  unhealthyCount: number;
  bySeverity: Record<Severity, number>;
  topFindings: SecurityFinding[];
  alerts: SecurityAlert[];
  regulatoryCompliance: RegulatoryCompliance | null;
}

export interface SecurityReport {
  generatedAt: string;
  bySubscription: SubscriptionSecurity[];
}

export const DELETION_STATUS_VALUES = ["Identificado", "Em análise", "Aprovado", "Agendado", "Parado", "Excluído"] as const;
export type DeletionStatusValue = (typeof DELETION_STATUS_VALUES)[number];

export interface DeletionCandidate {
  resourceId: string;
  name: string;
  type: string;
  subscriptionId: string;
  resourceGroup: string;
  location: string;
  owner: string;
  produto: string;
  mtdCost: number;
  currency: string;
  status: DeletionStatusValue;
}

export interface DeletionCandidatesReport {
  generatedAt: string;
  resources: DeletionCandidate[];
  totalMtdCost: number;
  currency: string;
}

export interface DeletionStatusHistoryEntry {
  resourceId: string;
  resourceName: string;
  subscriptionId: string;
  subscriptionName: string;
  status: DeletionStatusValue;
  previousStatus: DeletionStatusValue | null;
  changedAt: string;
  monthlyCost: number;
  currency: string;
  weeklyRealizedSavings?: WeeklyRealizedSavings;
}

export interface DeletionStatusHistoryReport {
  updatedAt: string;
  history: DeletionStatusHistoryEntry[];
}

export interface ServiceTarget {
  subscriptionId: string;
  service: string;
  targetAmount: number;
  currency: string;
}

export interface ServiceTargetsReport {
  updatedAt: string;
  targets: ServiceTarget[];
}

export interface IncentiveSubscription {
  subscriptionId: string;
  subscriptionName: string;
  offerName: string;
  totalCredit: number;
  usedCost: number;
  currency: string;
  startDate: string;
  expiresOn: string;
}

export interface IncentiveSubscriptionsReport {
  updatedAt: string;
  subscriptions: IncentiveSubscription[];
}

export interface CreatedResourceEntry {
  resourceId: string;
  name: string;
  type: string;
  subscriptionId: string;
  subscriptionName: string;
  resourceGroup: string;
  location: string;
  createdAt: string | null;
  dateSource: "azure" | "desconhecido";
  firstSeenAt: string;
  createdBy: string | null;
  createdByType: string | null;
  status: "Ativo" | "Excluído";
  deletedAt: string | null;
}

export interface CreatedResourcesReport {
  generatedAt: string;
  resources: CreatedResourceEntry[];
}

export interface PipelineHealthEntry {
  name: string;
  blobName: string;
  scheduleUtc: string;
  generatedAt: string | null;
  hoursSinceGenerated: number | null;
  status: "ok" | "atencao" | "critico";
}

export interface PipelineHealthReport {
  generatedAt: string;
  entries: PipelineHealthEntry[];
}

export interface InventoryResource {
  resourceId: string;
  name: string;
  type: string;
  shortType: string;
  friendlyType: string;
  provider: string;
  kind: string | null;
  sku: string | null;
  location: string;
  resourceGroup: string;
  subscriptionId: string;
  subscriptionName: string;
  managed: boolean;
  tagged: boolean;
  mtdCost: number | null;
}

export interface InventoryBreakdown {
  key: string;
  count: number;
  cost: number;
}

export interface InventoryReport {
  generatedAt: string;
  currency: string;
  totalResources: number;
  totalManaged: number;
  totalUntagged: number;
  totalWithoutCost: number;
  distinctTypes: number;
  distinctResourceGroups: number;
  distinctLocations: number;
  byType: InventoryBreakdown[];
  byProvider: InventoryBreakdown[];
  byResourceGroup: InventoryBreakdown[];
  byLocation: InventoryBreakdown[];
  bySubscription: InventoryBreakdown[];
  resources: InventoryResource[];
}
