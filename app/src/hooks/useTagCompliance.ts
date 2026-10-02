import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

export function useTagCompliance() {
  return useQuery({
    queryKey: ["tag-compliance"],
    queryFn: api.getTagCompliance,
    refetchInterval: 30 * 60 * 1000,
  });
}

export function useRefreshTagCompliance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.refreshTagCompliance,
    onSuccess: (report) => queryClient.setQueryData(["tag-compliance"], report),
  });
}
