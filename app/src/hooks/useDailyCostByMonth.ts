import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

export function useDailyCostByMonth(month: string, enabled: boolean) {
  return useQuery({
    queryKey: ["daily-cost-by-month", month],
    queryFn: () => api.getDailyCostByMonth(month),
    enabled: enabled && !!month,
    staleTime: 30 * 60 * 1000,
  });
}
