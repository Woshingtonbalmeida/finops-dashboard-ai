import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

export function useCreatedResources() {
  return useQuery({
    queryKey: ["created-resources"],
    queryFn: api.getCreatedResources,
    refetchInterval: 30 * 60 * 1000,
  });
}

export function useRefreshCreatedResources() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.refreshCreatedResources,
    onSuccess: (report) => queryClient.setQueryData(["created-resources"], report),
  });
}
