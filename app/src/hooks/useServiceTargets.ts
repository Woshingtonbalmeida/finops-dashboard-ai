import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { ServiceTarget } from "../types";

export function useServiceTargets() {
  return useQuery({
    queryKey: ["service-targets"],
    queryFn: api.getServiceTargets,
    refetchInterval: 30 * 60 * 1000,
  });
}

export function useSaveServiceTargets() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (targets: ServiceTarget[]) => api.setServiceTargets(targets),
    onSuccess: (report) => {
      queryClient.setQueryData(["service-targets"], report);
    },
  });
}
