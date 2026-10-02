import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

export function useSummary() {
  return useQuery({
    queryKey: ["summary"],
    queryFn: api.getSummary,
    refetchInterval: 5 * 60 * 1000,
  });
}

// Rebuilds the curated summary from whatever CSVs are already in blob storage right now,
// instead of waiting for the next blob-trigger event (a new export landing) — needed right
// after a focus.ts aggregation change, since the deployed code only reflects in summary.json
// once something re-runs it.
export function useRefreshSummary() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.refreshSummary,
    onSuccess: (summary) => queryClient.setQueryData(["summary"], summary),
  });
}
