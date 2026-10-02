import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

export function useOptimization() {
  return useQuery({
    queryKey: ["optimization"],
    queryFn: api.getOptimization,
    refetchInterval: 30 * 60 * 1000,
  });
}

// Rebuilds optimization.json on demand — needed right after an optimization.ts change,
// since the timer only reruns daily at 06:30 UTC otherwise.
export function useRefreshOptimization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.refreshOptimization,
    onSuccess: (report) => queryClient.setQueryData(["optimization"], report),
  });
}
