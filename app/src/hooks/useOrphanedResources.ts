import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

export function useOrphanedResources() {
  return useQuery({
    queryKey: ["orphaned-resources"],
    queryFn: api.getOrphanedResources,
    refetchInterval: 30 * 60 * 1000,
  });
}
