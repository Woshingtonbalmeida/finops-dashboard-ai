import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

export function useVersion() {
  return useQuery({
    queryKey: ["version"],
    queryFn: api.getVersion,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  });
}
