import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

export function useBudgets() {
  return useQuery({
    queryKey: ["budgets"],
    queryFn: api.getBudgets,
    refetchInterval: 30 * 60 * 1000,
  });
}

export function useRefreshBudgets() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.refreshBudgets,
    onSuccess: (report) => queryClient.setQueryData(["budgets"], report),
  });
}
