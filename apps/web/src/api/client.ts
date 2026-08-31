import type {
  PlantSummary,
  ProductionResponse,
  SensorPoint,
  VerificationRecord,
  VerificationRequest,
} from "@nexus/contracts";
import { isHistory, isPlantSummary, isProductionResponse, isVerificationRecord } from "./validation";
import { historyRequested, historyFetched } from "../observability/performanceProbe";

interface HistoryResponse {
  equipmentId: string;
  intervalMs: number;
  generatedAt: number;
  points: SensorPoint[];
}

export class ApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "ApiError";
  }
}

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort(init?.signal?.reason);
  const timeout = window.setTimeout(() => controller.abort(new ApiError("서버 응답 시간이 초과되었습니다.")), 10_000);
  if (init?.signal?.aborted) abort();
  else init?.signal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
    if (!response.ok) throw new ApiError(`Request failed: ${response.status}`, response.status);
    return await response.json() as T;
  } finally {
    window.clearTimeout(timeout);
    init?.signal?.removeEventListener("abort", abort);
  }
}

export const api = {
  getProduction: async (signal?: AbortSignal): Promise<ProductionResponse> => {
    const data = await requestJson<unknown>("/api/production", { signal });
    if (!isProductionResponse(data)) throw new ApiError("생산 실적 데이터 형식을 확인할 수 없습니다.");
    return data;
  },
  getPlantSummary: async (signal?: AbortSignal): Promise<PlantSummary> => {
    const data = await requestJson<unknown>("/api/plant/summary", { signal });
    if (!isPlantSummary(data)) throw new ApiError("공정 현황 데이터 형식을 확인할 수 없습니다.");
    return data;
  },
  getHistory: async (equipmentId: string, signal?: AbortSignal): Promise<HistoryResponse> => {
    historyRequested(equipmentId);
    const data = await requestJson<unknown>(`/api/equipment/${encodeURIComponent(equipmentId)}/history?intervalMs=100`, { signal });
    if (!isHistory(data) || data.equipmentId !== equipmentId) throw new ApiError("선택한 설비의 유효한 센서 이력이 없습니다.");
    historyFetched(equipmentId);
    return data;
  },
  createVerification: async (input: VerificationRequest): Promise<VerificationRecord> => {
    const data = await requestJson<unknown>("/api/verifications", {
      method: "POST",
      body: JSON.stringify(input),
    });
    if (!isVerificationRecord(data) || data.incidentId !== input.incidentId || data.assignee !== input.assignee ||
      data.requestId !== input.requestId) throw new ApiError("작업 지시 결과를 확인할 수 없습니다.");
    return data;
  },
};
