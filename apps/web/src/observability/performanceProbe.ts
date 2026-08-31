import type { SensorPoint } from "@nexus/contracts";

// Opt-in benchmark build only. No telemetry endpoint, user input or sensor values are recorded.
const enabled = import.meta.env.VITE_PERFORMANCE_PROBE === "true";
const limit = 3_000;
interface Measurement { name: string; equipmentId: string; startTime: number; durationMs: number }
interface HistoryTiming { start: number; fetched?: number; adopted?: number }
interface BatchTiming { first: number; last: number; timestamp: number; committed: number }
interface NavigationTiming { start: number; historyReady?: boolean }
export interface ChartTicket {
  equipmentId: string;
  start: number;
  timestamp: number;
  history?: HistoryTiming;
  batch?: BatchTiming;
  interaction?: { name: string; start: number };
  navigation?: NavigationTiming;
}
const measurements: Measurement[] = [];
const longTasks: Array<{ startTime: number; durationMs: number }> = [];
const events: Array<{ name: string; interactionId: number; startTime: number; durationMs: number; inputDelayMs: number }> = [];
const histories = new Map<string, HistoryTiming>();
const navigations = new Map<string, NavigationTiming>();
const receipts = new Map<string, number>();
const batches = new Map<string, BatchTiming>();
const interactions = new Map<string, { name: string; start: number }>();
const verifications = new Map<string, { start: number; equipmentId: string; stored?: number }>();
const counts = { frames: 0, hiddenFrames: 0, droppedMeasurements: 0, rawPoints: 0, displayedPoints: 0 };

function boundedPush<T>(items: T[], value: T) {
  if (items.length === limit) { items.shift(); counts.droppedMeasurements += 1; }
  items.push(value);
}
function record(name: string, equipmentId: string, start: number, end = performance.now()) {
  if (!enabled || !Number.isFinite(start) || end < start) return;
  boundedPush(measurements, { name, equipmentId, startTime: start, durationMs: end - start });
}
function nextFrameOpportunity(callback: () => void) {
  // Two rAF callbacks bracket a rendering opportunity, NOT a guaranteed compositor/pixel paint.
  requestAnimationFrame(() => requestAnimationFrame(callback));
}

export function setupPerformanceProbe() {
  if (!enabled || window.__nexusPerformance) return;
  if (PerformanceObserver.supportedEntryTypes.includes("longtask")) {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) boundedPush(longTasks, { startTime: entry.startTime, durationMs: entry.duration });
    }).observe({ type: "longtask", buffered: true });
  }
  if (PerformanceObserver.supportedEntryTypes.includes("event")) {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as PerformanceEventTiming[]) {
        if (!entry.interactionId) continue;
        boundedPush(events, { name: entry.name, interactionId: entry.interactionId, startTime: entry.startTime,
          durationMs: entry.duration, inputDelayMs: entry.processingStart - entry.startTime });
      }
    }).observe({ type: "event", buffered: true, durationThreshold: 16 } as PerformanceObserverInit);
  }
  window.__nexusPerformance = {
    snapshot: () => ({
      elapsedMs: performance.now(), visibility: document.visibilityState,
      measurements: measurements.map((value) => ({ ...value })), longTasks: [...longTasks], events: [...events], counts: { ...counts },
      supportedEntryTypes: PerformanceObserver.supportedEntryTypes,
    }),
  };
}

export function diagnosticNavigationRequested(equipmentId: string) {
  if (enabled) navigations.set(equipmentId, { start: performance.now() });
}
export function historyRequested(equipmentId: string) {
  if (enabled) histories.set(equipmentId, { start: performance.now() });
}
export function historyFetched(equipmentId: string) {
  if (!enabled) return;
  const history = histories.get(equipmentId);
  if (history) { history.fetched = performance.now(); record("history_fetch_parse_validate", equipmentId, history.start, history.fetched); }
}
export function historyAdopted(equipmentId: string) {
  if (!enabled) return;
  const history = histories.get(equipmentId);
  if (history) history.adopted = performance.now();
  const navigation = navigations.get(equipmentId);
  if (navigation) navigation.historyReady = true;
}
export function streamReceived(equipmentId: string, timestamp: number, receivedAt: number) {
  if (!enabled) return;
  receipts.set(`${equipmentId}:${timestamp}`, receivedAt);
  if (receipts.size > 256) receipts.delete(receipts.keys().next().value!);
}
export function batchCommitted(equipmentId: string, points: SensorPoint[]) {
  if (!enabled || !points.length) return;
  const received = points.map((point) => receipts.get(`${equipmentId}:${point.timestamp}`)).filter((time): time is number => time !== undefined);
  for (const point of points) receipts.delete(`${equipmentId}:${point.timestamp}`);
  if (!received.length) return;
  const timestamp = points.at(-1)!.timestamp;
  batches.set(`${equipmentId}:${timestamp}`, { first: received[0]!, last: received.at(-1)!, timestamp, committed: performance.now() });
  if (batches.size > 64) batches.delete(batches.keys().next().value!);
}
export function interactionRequested(equipmentId: string, name: string) {
  if (enabled) interactions.set(equipmentId, { name, start: performance.now() });
}
export function chartUpdateStarted(equipmentId: string, timestamp: number, rawPoints: number, displayedPoints: number): ChartTicket | null {
  if (!enabled) return null;
  counts.rawPoints = rawPoints;
  counts.displayedPoints = displayedPoints;
  const history = histories.get(equipmentId);
  const navigation = navigations.get(equipmentId);
  return { equipmentId, timestamp, start: performance.now(),
    history: history?.adopted === undefined ? undefined : history,
    navigation: navigation?.historyReady ? navigation : undefined,
    batch: batches.get(`${equipmentId}:${timestamp}`), interaction: interactions.get(equipmentId) };
}
export function chartUpdateFinished(ticket: ChartTicket | null, isDisposed: () => boolean) {
  if (!enabled || !ticket) return;
  nextFrameOpportunity(() => {
    if (isDisposed()) return;
    if (document.visibilityState !== "visible") { counts.hiddenFrames += 1; return; }
    const end = performance.now();
    const id = ticket.equipmentId;
    counts.frames += 1;
    record("chart_effect_to_frame_opportunity", id, ticket.start, end);
    if (ticket.navigation && navigations.get(id) === ticket.navigation) {
      record("equipment_click_to_history_frame_opportunity", id, ticket.navigation.start, end);
      navigations.delete(id);
    }
    if (ticket.history && histories.get(id) === ticket.history) {
      record("history_request_to_frame_opportunity", id, ticket.history.start, end);
      record("history_adopt_to_frame_opportunity", id, ticket.history.adopted!, end);
      histories.delete(id);
    }
    if (ticket.batch && batches.get(`${id}:${ticket.timestamp}`) === ticket.batch) {
      record("stream_oldest_receive_to_frame_opportunity", id, ticket.batch.first, end);
      record("stream_latest_receive_to_frame_opportunity", id, ticket.batch.last, end);
      record("batch_commit_to_frame_opportunity", id, ticket.batch.committed, end);
      record("stream_batch_wait", id, ticket.batch.first, ticket.batch.committed);
      // Only meaningful on this loopback host; never use this as synchronized industrial clock latency.
      record("loopback_sample_age_at_frame_opportunity", id, end - Math.max(0, Date.now() - ticket.timestamp), end);
      batches.delete(`${id}:${ticket.timestamp}`);
    }
    if (ticket.interaction && interactions.get(id) === ticket.interaction) {
      record(`interaction_${ticket.interaction.name}_to_frame_opportunity`, id, ticket.interaction.start, end);
      interactions.delete(id);
    }
  });
}
export function verificationStarted(requestId: string, equipmentId: string) {
  if (enabled) verifications.set(requestId, { start: performance.now(), equipmentId });
}
export function verificationStored(requestId: string) {
  if (!enabled) return;
  const pending = verifications.get(requestId);
  if (pending) { pending.stored = performance.now(); record("verification_request_and_persistence", pending.equipmentId, pending.start, pending.stored); }
}
export function verificationPresented(requestId: string) {
  if (!enabled) return;
  const pending = verifications.get(requestId);
  if (!pending?.stored) return;
  nextFrameOpportunity(() => {
    if (verifications.get(requestId) !== pending) return;
    record("verification_submit_to_result_frame_opportunity", pending.equipmentId, pending.start);
    verifications.delete(requestId);
  });
}

declare global {
  interface Window {
    __nexusPerformance?: { snapshot: () => {
      elapsedMs: number; visibility: DocumentVisibilityState; measurements: Measurement[];
      longTasks: Array<{ startTime: number; durationMs: number }>;
      events: Array<{ name: string; interactionId: number; startTime: number; durationMs: number; inputDelayMs: number }>;
      counts: typeof counts; supportedEntryTypes: readonly string[];
    } };
  }
}
