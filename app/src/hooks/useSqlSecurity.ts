import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

export function useSqlSecurity() {
  return useQuery({
    queryKey: ["sql-security"],
    queryFn: api.getSqlSecurity,
    refetchInterval: 30 * 60 * 1000,
  });
}

export function useRefreshSqlSecurity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.refreshSqlSecurity,
    onSuccess: (report) => queryClient.setQueryData(["sql-security"], report),
  });
}
