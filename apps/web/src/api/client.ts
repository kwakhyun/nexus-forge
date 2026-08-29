import type {
  PlantSummary,
  SensorPoint,
  VerificationRecord,
  VerificationRequest,
} from "@nexus/contracts";

interface HistoryResponse {
  intervalMs: number;
  generatedAt: number;
  points: SensorPoint[];
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

export const api = {
  getPlantSummary: () => requestJson<PlantSummary>("/api/plant/summary"),
  getHistory: (equipmentId: string) =>
    requestJson<HistoryResponse>(`/api/equipment/${equipmentId}/history?intervalMs=100`),
  createVerification: (input: VerificationRequest) =>
    requestJson<VerificationRecord>("/api/verifications", {
      method: "POST",
      body: JSON.stringify(input),
    }),
};
