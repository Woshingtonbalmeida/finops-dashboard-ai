import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

export function useAiInsights() {
  return useQuery({
    queryKey: ["ai-insights"],
    queryFn: api.getAiInsights,
    refetchInterval: 30 * 60 * 1000,
  });
}

export function useRefreshAiInsights() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.refreshAiInsights,
    onSuccess: (report) => queryClient.setQueryData(["ai-insights"], report),
  });
}
