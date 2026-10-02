import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

export function useResourceSizing() {
  return useQuery({
    queryKey: ["resource-sizing"],
    queryFn: api.getResourceSizing,
    refetchInterval: 30 * 60 * 1000,
  });
}

export function useRefreshResourceSizing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.refreshResourceSizing,
    onSuccess: (report) => queryClient.setQueryData(["resource-sizing"], report),
  });
}
