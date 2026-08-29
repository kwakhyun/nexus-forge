import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts/core";
import type { EChartsCoreOption } from "echarts/core";
import { LineChart } from "echarts/charts";
import {
  AxisPointerComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TitleComponent,
  TooltipComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { Incident, SensorPoint } from "@nexus/contracts";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CircleNotchIcon,
  CrosshairIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
} from "@phosphor-icons/react";
import { downsampleSynchronized } from "../lib/downsample";
import { formatTime } from "../lib/format";

echarts.use([
  LineChart,
  AxisPointerComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TitleComponent,
  TooltipComponent,
  CanvasRenderer,
]);

interface SignalWorkbenchProps {
  points: SensorPoint[];
  incident: Incident;
  loading?: boolean;
}

const colors = {
  blue: "#3d72ff",
  violet: "#9f6bff",
  cyan: "#37c9d0",
  red: "#ff4d57",
  grid: "rgba(148, 163, 184, 0.14)",
  text: "#7f8c95",
};

export function SignalWorkbench({ points, incident, loading = false }: SignalWorkbenchProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const [viewRange, setViewRange] = useState<{ start: number; end: number } | null>(null);
  const sampled = useMemo(() => downsampleSynchronized(points, 1_800), [points]);
  const selectedPoint = useMemo(() => sampled.reduce<SensorPoint | undefined>((closest, point) => {
    if (!closest) return point;
    return Math.abs(point.timestamp - incident.startedAt) < Math.abs(closest.timestamp - incident.startedAt) ? point : closest;
  }, undefined), [incident.startedAt, sampled]);

  useEffect(() => {
    if (!chartRef.current) return;
    chart.current = echarts.init(chartRef.current, undefined, { renderer: "canvas" });
    const observer = new ResizeObserver(() => chart.current?.resize());
    observer.observe(chartRef.current);
    return () => {
      observer.disconnect();
      chart.current?.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chart.current || sampled.length === 0) return;
    const eventStart = incident.startedAt - 50_000;
    const eventEnd = incident.startedAt + 82_000;
    const axisCommon = {
      type: "time" as const,
      min: "dataMin" as const,
      max: "dataMax" as const,
      axisLine: { lineStyle: { color: colors.grid } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { color: colors.text, fontSize: 11, formatter: (value: number) => formatTime(value).slice(0, 5) },
    };
    const yAxisCommon = {
      type: "value" as const,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: colors.text, fontSize: 10 },
      splitLine: { lineStyle: { color: colors.grid, type: "dashed" as const } },
    };
    const markArea = {
      silent: true,
      itemStyle: { color: "rgba(255, 77, 87, 0.10)" },
      data: [[{ xAxis: eventStart }, { xAxis: eventEnd }] as [{ xAxis: number }, { xAxis: number }]],
    };

    const option: EChartsCoreOption = {
      animation: false,
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "cross", lineStyle: { color: colors.blue, type: "dashed" } },
        backgroundColor: "#111c22",
        borderColor: "#35454f",
        textStyle: { color: "#f5f7f8", fontSize: 12 },
        valueFormatter: (value: unknown) => typeof value === "number" ? value.toFixed(2) : String(value),
      },
      axisPointer: { link: [{ xAxisIndex: "all" }] },
      legend: [
        {
          data: ["좌측 장력", "우측 장력"],
          left: 176,
          top: 31,
          itemWidth: 14,
          itemHeight: 2,
          textStyle: { color: "#9ba8b0", fontSize: 10 },
        },
        {
          data: ["설정 온도", "측정 온도"],
          left: 176,
          top: "28%",
          itemWidth: 14,
          itemHeight: 2,
          textStyle: { color: "#9ba8b0", fontSize: 10 },
        },
      ],
      grid: [
        { left: 165, right: 20, top: 34, height: "19%" },
        { left: 165, right: 20, top: "29%", height: "16%" },
        { left: 165, right: 20, top: "51%", height: "16%" },
        { left: 165, right: 20, top: "73%", height: "17%" },
      ],
      title: [
        { text: "웹 장력(좌/우)", subtext: "N", left: 0, top: 29 },
        { text: "오븐 Z3 온도", subtext: "°C", left: 0, top: "28%" },
        { text: "라인 속도", subtext: "m/min", left: 0, top: "50%" },
        { text: "비전 검사 결함률", subtext: "%", left: 0, top: "72%" },
      ].map((item) => ({
        ...item,
        textStyle: { color: "#bcc6cc", fontSize: 13, fontWeight: 600 },
        subtextStyle: { color: colors.text, fontSize: 11, lineHeight: 19 },
      })),
      xAxis: [0, 1, 2, 3].map((gridIndex) => ({
        ...axisCommon,
        gridIndex,
        axisLabel: gridIndex === 3 ? axisCommon.axisLabel : { show: false },
      })),
      yAxis: [
        { ...yAxisCommon, gridIndex: 0, min: 0, max: 90 },
        { ...yAxisCommon, gridIndex: 1, min: 145, max: 180 },
        { ...yAxisCommon, gridIndex: 2, min: 50, max: 100 },
        { ...yAxisCommon, gridIndex: 3, min: 0, max: 2.2 },
      ],
      dataZoom: [{
        type: "inside",
        xAxisIndex: [0, 1, 2, 3],
        filterMode: "none",
        ...(viewRange ? { startValue: viewRange.start, endValue: viewRange.end } : { start: 0, end: 100 }),
      }],
      series: [
        {
          name: "좌측 장력",
          type: "line",
          xAxisIndex: 0,
          yAxisIndex: 0,
          showSymbol: false,
          sampling: "lttb",
          lineStyle: { color: colors.blue, width: 1.4 },
          itemStyle: { color: colors.blue },
          data: sampled.map((point) => [point.timestamp, point.webTensionLeft]),
          markArea,
          markLine: {
            silent: true,
            symbol: "none",
            label: { show: false },
            data: [
              { xAxis: eventStart, lineStyle: { color: colors.red, type: "dashed" } },
              { xAxis: incident.startedAt, lineStyle: { color: colors.blue, type: "dashed" } },
              { xAxis: eventEnd, lineStyle: { color: colors.red, type: "dashed" } },
            ],
          },
        },
        {
          name: "우측 장력",
          type: "line",
          xAxisIndex: 0,
          yAxisIndex: 0,
          showSymbol: false,
          sampling: "lttb",
          lineStyle: { color: colors.violet, width: 1.4 },
          itemStyle: { color: colors.violet },
          data: sampled.map((point) => [point.timestamp, point.webTensionRight]),
        },
        {
          name: "설정 온도",
          type: "line",
          xAxisIndex: 1,
          yAxisIndex: 1,
          showSymbol: false,
          silent: true,
          lineStyle: { color: colors.cyan, width: 1.2, type: "dashed" },
          itemStyle: { color: colors.cyan },
          data: sampled.map((point) => [point.timestamp, 160]),
        },
        {
          name: "측정 온도",
          type: "line",
          xAxisIndex: 1,
          yAxisIndex: 1,
          showSymbol: false,
          sampling: "lttb",
          lineStyle: { color: colors.blue, width: 1.4 },
          itemStyle: { color: colors.blue },
          data: sampled.map((point) => [point.timestamp, point.ovenTemperature]),
          markArea,
        },
        {
          name: "라인 속도",
          type: "line",
          xAxisIndex: 2,
          yAxisIndex: 2,
          showSymbol: false,
          sampling: "lttb",
          lineStyle: { color: colors.blue, width: 1.4 },
          itemStyle: { color: colors.blue },
          data: sampled.map((point) => [point.timestamp, point.lineSpeed]),
          markArea,
        },
        {
          name: "비전 검사 결함률",
          type: "line",
          xAxisIndex: 3,
          yAxisIndex: 3,
          showSymbol: false,
          sampling: "lttb",
          lineStyle: { color: colors.violet, width: 1.5 },
          areaStyle: { color: "rgba(159, 107, 255, 0.10)" },
          itemStyle: { color: colors.violet },
          data: sampled.map((point) => [point.timestamp, point.defectRate]),
          markArea,
        },
      ],
    };

    chart.current.setOption(option, { notMerge: true, lazyUpdate: true });
  }, [incident.startedAt, sampled, viewRange]);

  const getBounds = () => {
    const start = sampled[0]?.timestamp;
    const end = sampled.at(-1)?.timestamp;
    return start === undefined || end === undefined ? null : { start, end };
  };

  const zoom = (factor: number) => {
    const bounds = getBounds();
    if (!bounds) return;
    const current = viewRange ?? bounds;
    const center = (current.start + current.end) / 2;
    const duration = Math.min(bounds.end - bounds.start, Math.max(60_000, (current.end - current.start) * factor));
    const start = Math.max(bounds.start, Math.min(bounds.end - duration, center - duration / 2));
    setViewRange({ start, end: start + duration });
  };

  const pan = (direction: -1 | 1) => {
    const bounds = getBounds();
    if (!bounds) return;
    const current = viewRange ?? bounds;
    const duration = current.end - current.start;
    const offset = duration * 0.25 * direction;
    const start = Math.max(bounds.start, Math.min(bounds.end - duration, current.start + offset));
    setViewRange({ start, end: start + duration });
  };

  const focusIncident = () => {
    const bounds = getBounds();
    if (!bounds) return;
    const duration = Math.min(10 * 60_000, bounds.end - bounds.start);
    const start = Math.max(bounds.start, Math.min(bounds.end - duration, incident.startedAt - duration / 2));
    setViewRange({ start, end: start + duration });
  };

  return (
    <section className="signal-workbench" aria-label="센서 신호 비교">
      <div className="signal-toolbar">
        <button type="button" onClick={() => setViewRange(null)}>최근 30분</button>
        <span className="signal-toolbar__meta">원본 100ms</span>
        <span className="toolbar-divider" />
        <button type="button" aria-label="축소" onClick={() => zoom(1.45)}><MagnifyingGlassMinusIcon size={17} /></button>
        <button type="button" aria-label="확대" onClick={() => zoom(0.65)}><MagnifyingGlassPlusIcon size={17} /></button>
        <button type="button" aria-label="이전 구간" onClick={() => pan(-1)}><ArrowLeftIcon size={17} /></button>
        <button type="button" aria-label="다음 구간" onClick={() => pan(1)}><ArrowRightIcon size={17} /></button>
        <time>{formatTime(incident.startedAt)}</time>
        <span className="toolbar-spacer" />
        <button type="button" aria-label="이상 구간으로 이동" onClick={focusIncident}><CrosshairIcon size={17} /></button>
        <button type="button" onClick={() => setViewRange(null)}>전체 구간</button>
        <span className="render-stat">{points.length.toLocaleString()}개 시점 · Canvas</span>
      </div>
      <div className="signal-chart-wrap">
        {loading ? (
          <div className="chart-loading"><CircleNotchIcon size={28} className="spin" /> 센서 이력을 불러오는 중입니다…</div>
        ) : null}
        <div className="signal-chart" ref={chartRef} role="img" aria-label="웹 장력, 오븐 온도, 라인 속도, 비전 검사 결함률을 같은 시간축으로 비교한 그래프" />
        {selectedPoint ? (
          <dl className="current-values" aria-label="선택 시점 센서값">
            <div className="current-values__pair">
              <dt>선택값</dt>
              <dd>좌측 {selectedPoint.webTensionLeft.toFixed(1)} N</dd>
              <dd>우측 {selectedPoint.webTensionRight.toFixed(1)} N</dd>
            </div>
            <div className="current-values__pair current-values__temperature">
              <dt>선택값</dt>
              <dd>{selectedPoint.ovenTemperature.toFixed(1)} °C</dd>
              <dd>설정값 160.0 °C</dd>
            </div>
            <div><dt>선택값</dt><dd>{selectedPoint.lineSpeed.toFixed(1)} m/min</dd></div>
            <div><dt>선택값</dt><dd>{selectedPoint.defectRate.toFixed(2)}%</dd></div>
          </dl>
        ) : null}
      </div>
    </section>
  );
}
