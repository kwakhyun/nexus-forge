import type { EChartsCoreOption } from "echarts/core";
import type { Incident, SensorPoint } from "@nexus/contracts";
import type { DiagnosticProfile } from "../domain/diagnosticProfiles";

const colors = { blue: "#3d72ff", cyan: "#37c9d0", red: "#ff4d57", grid: "rgba(148, 163, 184, 0.14)", text: "#7f8c95" };

/** One chart renderer; panel count, scales, channels and reference values come from the equipment profile. */
export function createSignalChartOption({ points, incident, profile, compact, formatTime, selected, visibleRange }: {
  points: SensorPoint[];
  incident: Incident;
  profile: DiagnosticProfile;
  compact: boolean;
  formatTime: (timestamp: number) => string;
  selected: Record<string, boolean>;
  visibleRange: { start: number; end: number } | null;
}): EChartsCoreOption {
  const panels = profile.panels;
  const band = 96 / panels.length;
  const eventStart = incident.startedAt - 50_000;
  const eventEnd = incident.startedAt + 82_000;
  const markArea = { silent: true, itemStyle: { color: "rgba(255, 77, 87, 0.10)" },
    data: [[{ xAxis: eventStart }, { xAxis: eventEnd }]] };
  const axisLabel = { color: colors.text, fontSize: 11, hideOverlap: true, formatter: (value: number) => formatTime(value).slice(0, 5) };
  return {
    animation: false,
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis", confine: true,
      axisPointer: { type: "cross", lineStyle: { color: colors.blue, type: "dashed" } },
      backgroundColor: "#111c22", borderColor: "#35454f", textStyle: { color: "#f5f7f8", fontSize: 12 },
      valueFormatter: (value: unknown) => typeof value === "number" ? value.toFixed(2) : String(value),
    },
    axisPointer: { link: [{ xAxisIndex: "all" }] },
    legend: panels.flatMap((panel, index) => panel.series.length > 1 || panel.reference ? [{
      data: [...(panel.reference ? [panel.reference.label] : []), ...panel.series.map((series) => series.label)],
      selected,
      left: compact ? 12 : 165,
      top: `${index * band + (compact ? 6 : 2)}%`,
      itemWidth: 14, itemHeight: 2, textStyle: { color: "#9ba8b0", fontSize: 10 },
    }] : []),
    grid: panels.map((_, index) => ({
      left: compact ? 44 : 165, right: 20,
      top: `${index * band + (compact ? 11 : 7)}%`, height: `${band - (compact ? 13 : 9)}%`,
    })),
    title: panels.map((panel, index) => ({
      text: compact ? `${panel.title} (${panel.unit})` : panel.title,
      subtext: compact ? "" : panel.unit, left: compact ? 12 : 0, top: `${index * band + 1}%`,
      textStyle: { color: "#bcc6cc", fontSize: 13, fontWeight: 600 },
      subtextStyle: { color: colors.text, fontSize: 11, lineHeight: 19 },
    })),
    xAxis: panels.map((_, gridIndex) => ({
      type: "time", gridIndex, min: "dataMin", max: "dataMax",
      axisLine: { lineStyle: { color: colors.grid } }, axisTick: { show: false }, splitLine: { show: false },
      axisLabel: gridIndex === panels.length - 1 ? axisLabel : { show: false },
    })),
    yAxis: panels.map((panel, gridIndex) => ({
      type: "value", gridIndex, min: panel.min, max: panel.max,
      axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: colors.text, fontSize: 10 },
      splitLine: { lineStyle: { color: colors.grid, type: "dashed" } },
    })),
    dataZoom: [{
      type: "inside", xAxisIndex: panels.map((_, index) => index), filterMode: "none",
      zoomOnMouseWheel: "ctrl", moveOnMouseMove: "ctrl", preventDefaultMouseMove: false,
      ...(visibleRange ? { startValue: visibleRange.start, endValue: visibleRange.end } : { start: 0, end: 100 }),
    }],
    series: panels.flatMap((panel, axisIndex) => [
      ...(panel.reference ? [{
        name: panel.reference.label, type: "line", xAxisIndex: axisIndex, yAxisIndex: axisIndex,
        showSymbol: false, sampling: "none", silent: true,
        lineStyle: { color: colors.cyan, width: 1.2, type: "dashed" }, itemStyle: { color: colors.cyan },
        data: points.map((point) => [point.timestamp, panel.reference!.value]),
      }] : []),
      ...panel.series.map((series, seriesIndex) => ({
        name: series.label, type: "line", xAxisIndex: axisIndex, yAxisIndex: axisIndex,
        showSymbol: false, sampling: "none",
        lineStyle: { color: series.color, width: 1.4 }, itemStyle: { color: series.color },
        data: points.map((point) => [point.timestamp, point[series.key]]),
        ...(seriesIndex === 0 ? { markArea } : {}),
        ...(axisIndex === 0 && seriesIndex === 0 ? { markLine: {
          silent: true, symbol: "none", label: { show: false },
          data: [
            { xAxis: eventStart, lineStyle: { color: colors.red, type: "dashed" } },
            { xAxis: incident.startedAt, lineStyle: { color: colors.blue, type: "dashed" } },
            { xAxis: eventEnd, lineStyle: { color: colors.red, type: "dashed" } },
          ],
        } } : {}),
      })),
    ]),
  };
}
