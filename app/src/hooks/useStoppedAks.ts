import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

export function useStoppedAks() {
  return useQuery({
    queryKey: ["stopped-aks"],
    queryFn: api.getStoppedAks,
    refetchInterval: 30 * 60 * 1000,
  });
}

export function useRefreshStoppedAks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.refreshStoppedAks,
    onSuccess: (report) => queryClient.setQueryData(["stopped-aks"], report),
  });
}
