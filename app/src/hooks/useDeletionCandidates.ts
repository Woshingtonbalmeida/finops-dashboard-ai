import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { DeletionCandidatesReport, DeletionStatusValue } from "../types";

export function useDeletionCandidates() {
  return useQuery({
    queryKey: ["deletion-candidates"],
    queryFn: api.getDeletionCandidates,
    refetchInterval: 30 * 60 * 1000,
  });
}

export function useSetDeletionStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ resourceId, status }: { resourceId: string; status: DeletionStatusValue }) =>
      api.setDeletionStatus(resourceId, status),
    onSuccess: (_result, { resourceId, status }) => {
      queryClient.setQueryData<DeletionCandidatesReport>(["deletion-candidates"], (prev) =>
        prev
          ? { ...prev, resources: prev.resources.map((r) => (r.resourceId === resourceId ? { ...r, status } : r)) }
          : prev,
      );
    },
  });
}

// One request applying every change in a single read-modify-write server-side, instead of
// N concurrent single-resource requests racing on the same status blob (whichever finished
// writing last used to silently win, discarding the rest).
export function useSetDeletionStatusBulk() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ resourceIds, status }: { resourceIds: string[]; status: DeletionStatusValue }) =>
      api.setDeletionStatusBulk(resourceIds, status),
    onSuccess: (_result, { resourceIds, status }) => {
      const idSet = new Set(resourceIds);
      queryClient.setQueryData<DeletionCandidatesReport>(["deletion-candidates"], (prev) =>
        prev
          ? { ...prev, resources: prev.resources.map((r) => (idSet.has(r.resourceId) ? { ...r, status } : r)) }
          : prev,
      );
    },
  });
}
