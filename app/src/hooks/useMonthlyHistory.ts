import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

export function useMonthlyHistory() {
  return useQuery({
    queryKey: ["monthly-history"],
    queryFn: api.getMonthlyHistory,
    refetchInterval: 30 * 60 * 1000,
  });
}

export function useRefreshMonthlyHistory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.refreshMonthlyHistory,
    onSuccess: (report) => queryClient.setQueryData(["monthly-history"], report),
  });
}
