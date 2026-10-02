import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type SetMonthVarianceNoteInput } from "../api/client";
import type { VarianceDimension } from "../types";

export function useMonthVariance(dimension: VarianceDimension, fromMonth?: string, toMonth?: string) {
  return useQuery({
    queryKey: ["month-variance", dimension, fromMonth ?? "", toMonth ?? ""],
    queryFn: () => api.getMonthVariance(dimension, fromMonth, toMonth),
    refetchInterval: 30 * 60 * 1000,
    // The month pair is part of the key, so switching months would otherwise blank the
    // table until the new fetch lands — keeping the previous data makes it swap in place.
    placeholderData: (previous) => previous,
  });
}

export function useSaveMonthVarianceNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SetMonthVarianceNoteInput) => api.setMonthVarianceNote(input),
    // Notes are merged into the rows server-side, so the variance query itself has to be
    // refetched — writing the notes report into the cache wouldn't update the table.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["month-variance"] });
    },
  });
}
