import type { SensorPoint } from "@nexus/contracts";

function signalScore(point: SensorPoint, previous: SensorPoint): number {
  return (
    Math.abs(point.webTensionLeft - previous.webTensionLeft) / 40 +
    Math.abs(point.webTensionRight - previous.webTensionRight) / 40 +
    Math.abs(point.ovenTemperature - previous.ovenTemperature) / 15 +
    Math.abs(point.lineSpeed - previous.lineSpeed) / 20 +
    Math.abs(point.defectRate - previous.defectRate) / 2
  );
}

export function downsampleSynchronized(
  points: SensorPoint[],
  maxPoints = 1_600,
): SensorPoint[] {
  if (points.length <= maxPoints || maxPoints < 3) return points;

  const output: SensorPoint[] = [points[0]!];
  const bucketSize = (points.length - 2) / (maxPoints - 2);

  for (let bucket = 0; bucket < maxPoints - 2; bucket += 1) {
    const start = Math.floor(bucket * bucketSize) + 1;
    const end = Math.min(points.length - 1, Math.floor((bucket + 1) * bucketSize) + 1);
    let best = points[start]!;
    let bestScore = -1;

    for (let index = start; index < end; index += 1) {
      const point = points[index]!;
      const previous = points[Math.max(0, index - 1)]!;
      const score = signalScore(point, previous) + point.defectRate * 0.08;
      if (score > bestScore) {
        best = point;
        bestScore = score;
      }
    }

    output.push(best);
  }

  output.push(points.at(-1)!);
  output.sort((a, b) => a.timestamp - b.timestamp);
  return output;
}
