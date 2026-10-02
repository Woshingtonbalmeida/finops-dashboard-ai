import {
  AksNodePoolUtilization,
  AppServicePlanUtilization,
  fetchAksNodePoolUtilization,
  fetchAppServicePlanUtilization,
} from "./resourceUtilization";

export interface ResourceSizingReport {
  generatedAt: string;
  aksNodePools: AksNodePoolUtilization[];
  appServicePlans: AppServicePlanUtilization[];
}

export async function fetchResourceSizing(subscriptionIds: string[], onWarn?: (message: string) => void): Promise<ResourceSizingReport> {
  const [aksNodePools, appServicePlans] = await Promise.all([
    fetchAksNodePoolUtilization(subscriptionIds, onWarn),
    fetchAppServicePlanUtilization(subscriptionIds, onWarn),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    aksNodePools,
    appServicePlans,
  };
}
