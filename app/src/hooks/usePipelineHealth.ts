import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

export function usePipelineHealth() {
  return useQuery({
    queryKey: ["pipeline-health"],
    queryFn: api.getPipelineHealth,
    refetchInterval: 10 * 60 * 1000,
  });
}
