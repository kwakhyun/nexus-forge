import type { SensorPoint } from "@nexus/contracts";

export function clampSignalWindow(range: { start: number; end: number }, bounds: { start: number; end: number }) {
  const duration = Math.max(0, Math.min(bounds.end - bounds.start, range.end - range.start));
  const start = Math.max(bounds.start, Math.min(bounds.end - duration, range.start));
  return { start, end: start + duration };
}

/** Use raw points for displayed values, never a changing downsampled subset. */
export function nearestIncidentPoint(points: SensorPoint[], timestamp: number): SensorPoint | undefined {
  if (!points.length || timestamp < points[0]!.timestamp || timestamp > points.at(-1)!.timestamp) return undefined;
  let low = 0;
  let high = points.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (points[middle]!.timestamp < timestamp) low = middle + 1;
    else high = middle;
  }
  const right = points[low]!;
  const left = points[Math.max(0, low - 1)]!;
  const point = timestamp - left.timestamp <= right.timestamp - timestamp ? left : right;
  return Math.abs(point.timestamp - timestamp) <= 1_000 ? point : undefined;
}
