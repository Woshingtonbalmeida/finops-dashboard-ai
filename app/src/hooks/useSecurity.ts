import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

export function useSecurity() {
  return useQuery({
    queryKey: ["security"],
    queryFn: api.getSecurity,
    refetchInterval: 30 * 60 * 1000,
  });
}
