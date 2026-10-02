import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

export function useForecast() {
  return useQuery({
    queryKey: ["forecast"],
    queryFn: api.getForecast,
    refetchInterval: 30 * 60 * 1000,
  });
}

export function useRefreshForecast() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.refreshForecast,
    onSuccess: (report) => queryClient.setQueryData(["forecast"], report),
  });
}
