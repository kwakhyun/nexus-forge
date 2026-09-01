import type { SensorKey, SensorPoint } from "@nexus/contracts";

const sensorKeys: readonly SensorKey[] = [
  "webTensionLeft",
  "webTensionRight",
  "ovenTemperature",
  "lineSpeed",
  "defectRate",
];

// First + last + both extrema of each sensor. Sharing their original timestamps
// prevents a peak in one sensor from displacing another sensor's extrema.
const candidatesPerBucket = 2 + sensorKeys.length * 2;

/**
 * Input is finite, timestamp-ordered sensor data validated at the API boundary.
 * Keeps each shared bucket's edges and per-sensor min/max within maxPoints.
 * It does NOT preserve every local peak, its duration, or occurrence count.
 * startIndex lets callers reduce an already validated trailing time window
 * without allocating a full-size intermediate slice.
 */
export function downsampleSynchronized(
  points: SensorPoint[],
  maxPoints = 1_600,
  startIndex = 0,
): SensorPoint[] {
  if (!Number.isInteger(maxPoints) || maxPoints <= 0) {
    throw new RangeError("The timestamp budget must be a positive integer");
  }
  if (!Number.isInteger(startIndex) || startIndex < 0 || startIndex > points.length) {
    throw new RangeError("The start index must be inside the input range");
  }
  const pointCount = points.length - startIndex;
  if (pointCount <= maxPoints) return startIndex === 0 ? points : points.slice(startIndex);
  if (maxPoints < candidatesPerBucket) {
    throw new RangeError(`At least ${candidatesPerBucket} timestamps are required to preserve all sensor extrema`);
  }

  const output: SensorPoint[] = [];
  const bucketCount = Math.floor(maxPoints / candidatesPerBucket);

  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const start = startIndex + Math.floor(bucket * pointCount / bucketCount);
    const end = startIndex + Math.floor((bucket + 1) * pointCount / bucketCount);
    const selected = new Set<number>([start, end - 1]);

    for (const key of sensorKeys) {
      let minIndex = start;
      let maxIndex = start;
      for (let index = start + 1; index < end; index += 1) {
        if (points[index]![key] < points[minIndex]![key]) minIndex = index;
        if (points[index]![key] > points[maxIndex]![key]) maxIndex = index;
      }
      selected.add(minIndex);
      selected.add(maxIndex);
    }

    for (const index of [...selected].sort((a, b) => a - b)) output.push(points[index]!);
  }

  return output;
}
