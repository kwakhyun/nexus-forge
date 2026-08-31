import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

export function usePlantSummary(enabled = true) {
  return useQuery({
    queryKey: ["plant-summary"],
    queryFn: ({ signal }) => api.getPlantSummary(signal),
    enabled,
    refetchInterval: 10_000,
    retry: 1,
    retryDelay: 500,
  });
}
