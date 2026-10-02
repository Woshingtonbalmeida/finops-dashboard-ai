import { useMemo } from "react";
import { useOptimization } from "./useOptimization";
import { useOrphanedResources } from "./useOrphanedResources";
import { useStoppedVMs } from "./useStoppedVMs";
import { useDeletionCandidates } from "./useDeletionCandidates";
import { useSummary } from "./useSummary";

export type OpportunitySource = "Advisor" | "Recursos órfãos" | "VMs paradas" | "Candidatos à exclusão";

export interface UnifiedOpportunity {
  key: string;
  source: OpportunitySource;
  description: string;
  subscriptionName: string;
  resourceCount: number;
  monthlySavings: number;
  currency: string;
}

export const OPPORTUNITY_SOURCE_ORDER: OpportunitySource[] = [
  "Advisor",
  "Recursos órfãos",
  "VMs paradas",
  "Candidatos à exclusão",
];

// Consolidates every source of savings opportunity into one shape, sorted by
// monthly savings descending. Shared by "Visão geral de oportunidades" and the
// weekly executive report so the two never drift out of sync with each other.
export function useUnifiedOpportunities() {
  const { data: optimization, isLoading: loadingOptimization, error: errorOptimization } = useOptimization();
  const { data: orphaned, isLoading: loadingOrphaned, error: errorOrphaned } = useOrphanedResources();
  const { data: stoppedVMs, isLoading: loadingStopped, error: errorStopped } = useStoppedVMs();
  const { data: deletionCandidates, isLoading: loadingDeletion, error: errorDeletion } = useDeletionCandidates();
  const { data: summary } = useSummary();

  const isLoading = loadingOptimization || loadingOrphaned || loadingStopped || loadingDeletion;
  const error = errorOptimization || errorOrphaned || errorStopped || errorDeletion;

  const opportunities = useMemo<UnifiedOpportunity[]>(() => {
    const subscriptionName = (id: string) => summary?.bySubscription.find((s) => s.subscriptionId === id)?.subscriptionName ?? id;
    const list: UnifiedOpportunity[] = [];

    // Advisor: annualized savings normalized to a monthly figure for fair comparison
    // with the MTD costs below. Only recommendations with a quantified savings count.
    for (const r of optimization?.advisorRecommendations ?? []) {
      if (r.totalAnnualSavingsBilling <= 0) continue;
      list.push({
        key: `advisor-${r.recommendationTypeId}`,
        source: "Advisor",
        description: r.problem,
        subscriptionName: r.subscriptionIds.map(subscriptionName).join(", "),
        resourceCount: r.affectedResourceCount,
        monthlySavings: r.totalAnnualSavingsBilling / 12,
        currency: r.billingCurrency,
      });
    }

    for (const r of orphaned?.resources ?? []) {
      list.push({
        key: `orphaned-${r.resourceId}`,
        source: "Recursos órfãos",
        description: r.name,
        subscriptionName: subscriptionName(r.subscriptionId),
        resourceCount: 1,
        monthlySavings: r.mtdCost,
        currency: r.currency,
      });
    }

    for (const vm of stoppedVMs?.vms ?? []) {
      list.push({
        key: `stopped-${vm.resourceId}`,
        source: "VMs paradas",
        description: vm.name,
        subscriptionName: subscriptionName(vm.subscriptionId),
        resourceCount: 1 + vm.attachedDiskCount,
        monthlySavings: vm.mtdCost,
        currency: vm.currency,
      });
    }

    for (const r of deletionCandidates?.resources ?? []) {
      list.push({
        key: `deletion-${r.resourceId}`,
        source: "Candidatos à exclusão",
        description: r.name,
        subscriptionName: subscriptionName(r.subscriptionId),
        resourceCount: 1,
        monthlySavings: r.mtdCost,
        currency: r.currency,
      });
    }

    return list.sort((a, b) => b.monthlySavings - a.monthlySavings);
  }, [optimization, orphaned, stoppedVMs, deletionCandidates, summary]);

  return { opportunities, isLoading, error };
}
