import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

export function useInventory() {
  return useQuery({
    queryKey: ["inventory"],
    queryFn: api.getInventory,
    refetchInterval: 30 * 60 * 1000,
  });
}

export function useRefreshInventory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.refreshInventory,
    onSuccess: (report) => {
      queryClient.setQueryData(["inventory"], report);
    },
  });
}
