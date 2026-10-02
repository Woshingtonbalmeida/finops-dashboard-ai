import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

export function useTagsByMonth(month: string, enabled: boolean) {
  return useQuery({
    queryKey: ["tags-by-month", month],
    queryFn: () => api.getTagsByMonth(month),
    enabled: enabled && !!month,
    staleTime: 30 * 60 * 1000,
  });
}
