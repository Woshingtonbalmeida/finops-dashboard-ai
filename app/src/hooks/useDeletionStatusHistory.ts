import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

export function useDeletionStatusHistory() {
  return useQuery({
    queryKey: ["deletion-status-history"],
    queryFn: api.getDeletionStatusHistory,
    refetchInterval: 30 * 60 * 1000,
  });
}
