import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

export function useStoppedVMs() {
  return useQuery({
    queryKey: ["stopped-vms"],
    queryFn: api.getStoppedVMs,
    refetchInterval: 30 * 60 * 1000,
  });
}

export function useRefreshStoppedVMs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.refreshStoppedVMs,
    onSuccess: (report) => queryClient.setQueryData(["stopped-vms"], report),
  });
}
