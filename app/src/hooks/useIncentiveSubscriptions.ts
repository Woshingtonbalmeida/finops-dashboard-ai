import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { IncentiveSubscription } from "../types";

export function useIncentiveSubscriptions() {
  return useQuery({
    queryKey: ["incentive-subscriptions"],
    queryFn: api.getIncentiveSubscriptions,
    refetchInterval: 30 * 60 * 1000,
  });
}

export function useSaveIncentiveSubscriptions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (subscriptions: IncentiveSubscription[]) => api.setIncentiveSubscriptions(subscriptions),
    onSuccess: (report) => {
      queryClient.setQueryData(["incentive-subscriptions"], report);
    },
  });
}
