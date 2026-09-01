import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts/core";
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
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { downsampleSynchronized } from "../lib/downsample";
import { useTimeFormat } from "../hooks/useTimeFormat";
import { useWorkspaceStore } from "../store/workspaceStore";
import { clampSignalWindow, nearestIncidentPoint } from "../lib/signalWindow";
import { createSignalChartOption } from "../lib/signalChart";
import { DIAGNOSTIC_PROFILES, type DiagnosticProfile } from "../domain/diagnosticProfiles";
import { chartUpdateStarted, chartUpdateFinished, interactionRequested, type ChartTicket } from "../observability/performanceProbe";

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
  historyError?: boolean;
  onRetryHistory?: () => void;
  profile?: DiagnosticProfile;
}

export function SignalWorkbench({
  points,
  incident,
  loading = false,
  historyError = false,
  onRetryHistory,
  profile = DIAGNOSTIC_PROFILES["COATER-02"],
}: SignalWorkbenchProps) {
  const { formatTime, zoneLabel } = useTimeFormat();
  const chartMinutes = useWorkspaceStore((state) => state.document.settings.chartMinutes);
  const chartRef = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const chartTicket = useRef<ChartTicket | null>(null);
  const legendSelection = useRef<Record<string, boolean>>({});
  const [viewRange, setViewRange] = useState<{ start: number; end: number } | null>(null);
  const [compact, setCompact] = useState(false);
  const sampled = useMemo(() => downsampleSynchronized(points, 1_800), [points]);
  const selectedPoint = useMemo(() => nearestIncidentPoint(points, incident.startedAt), [incident.startedAt, points]);

  useEffect(() => {
    if (!chartRef.current) return;
    const instance = echarts.init(chartRef.current, undefined, { renderer: "canvas" });
    let disposed = false;
    chart.current = instance;
    instance.on("finished", () => {
      const ticket = chartTicket.current;
      chartTicket.current = null;
      chartUpdateFinished(ticket, () => disposed);
    });
    instance.on("legendselectchanged", (event) => {
      // Keep a user's visible-series choice when the live stream redraws the chart.
      legendSelection.current = (event as { selected: Record<string, boolean> }).selected;
    });
    instance.on("datazoom", () => {
      const [range] = instance.getOption().dataZoom as Array<{ startValue?: number; endValue?: number }>;
      if (range && typeof range.startValue === "number" && typeof range.endValue === "number") {
        setViewRange({ start: range.startValue, end: range.endValue });
      }
    });
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setCompact(entry.contentRect.width < 640);
      instance.resize();
    });
    observer.observe(chartRef.current);
    return () => {
      disposed = true;
      chartTicket.current = null;
      observer.disconnect();
      chart.current?.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chart.current || sampled.length === 0) return;
    chartTicket.current = chartUpdateStarted(profile.equipmentId, points.at(-1)!.timestamp, points.length, sampled.length);
    const visibleRange = viewRange ? clampSignalWindow(viewRange, { start: sampled[0]!.timestamp, end: sampled.at(-1)!.timestamp }) : chartMinutes < 30 ? { start: Math.max(sampled[0]!.timestamp, sampled.at(-1)!.timestamp - chartMinutes * 60_000), end: sampled.at(-1)!.timestamp } : null;
    const option = createSignalChartOption({ points: sampled, incident, profile, compact, formatTime,
      selected: legendSelection.current, visibleRange });
    chart.current.setOption(option, { notMerge: true, lazyUpdate: true });
  }, [chartMinutes, compact, formatTime, incident, points, profile, sampled, viewRange]);

  const updateRange = (range: { start: number; end: number } | null, action: string) => {
    if (range?.start === viewRange?.start && range?.end === viewRange?.end) return;
    interactionRequested(profile.equipmentId, action);
    setViewRange(range);
  };

  const getBounds = () => {
    const start = sampled[0]?.timestamp;
    const end = sampled.at(-1)?.timestamp;
    return start === undefined || end === undefined ? null : { start, end };
  };
  const getLiveRange = () => {
    const bounds = getBounds();
    return bounds ? { start: Math.max(bounds.start, bounds.end - chartMinutes * 60_000), end: bounds.end } : null;
  };

  const zoom = (factor: number) => {
    const bounds = getBounds();
    if (!bounds) return;
    const current = clampSignalWindow(viewRange ?? getLiveRange() ?? bounds, bounds);
    const center = (current.start + current.end) / 2;
    const duration = Math.min(bounds.end - bounds.start, Math.max(60_000, (current.end - current.start) * factor));
    const start = Math.max(bounds.start, Math.min(bounds.end - duration, center - duration / 2));
    updateRange({ start, end: start + duration }, "zoom");
  };

  const pan = (direction: -1 | 1) => {
    const bounds = getBounds();
    if (!bounds) return;
    const current = clampSignalWindow(viewRange ?? getLiveRange() ?? bounds, bounds);
    const duration = current.end - current.start;
    const offset = duration * 0.25 * direction;
    const start = Math.max(bounds.start, Math.min(bounds.end - duration, current.start + offset));
    updateRange({ start, end: start + duration }, "pan");
  };

  const focusIncident = () => {
    const bounds = getBounds();
    if (!bounds) return;
    const duration = Math.min(10 * 60_000, bounds.end - bounds.start);
    const start = Math.max(bounds.start, Math.min(bounds.end - duration, incident.startedAt - duration / 2));
    updateRange({ start, end: start + duration }, "focus_incident");
  };
  const bounds = getBounds();
  const currentRange = viewRange && bounds ? clampSignalWindow(viewRange, bounds) : getLiveRange();
  const rangeAdjusted = viewRange && currentRange && (viewRange.start !== currentRange.start || viewRange.end !== currentRange.end);
  const noData = !bounds || loading || historyError;

  return (
    <section className="signal-workbench" aria-label="센서 신호 비교">
      <div className="signal-toolbar">
        <button type="button" onClick={() => updateRange(null, "follow_live")} aria-pressed={viewRange === null}>실시간 따라가기</button>
        <span className="signal-toolbar__meta">이력 100ms / 실시간 250ms</span>
        <span className="toolbar-divider" />
        <button type="button" aria-label="축소" title="축소" disabled={noData || !viewRange} onClick={() => zoom(1.45)}><MagnifyingGlassMinusIcon size={17} /></button>
        <button type="button" aria-label="확대" title="확대" disabled={noData || Boolean(currentRange && currentRange.end - currentRange.start <= 60_000)} onClick={() => zoom(0.65)}><MagnifyingGlassPlusIcon size={17} /></button>
        <button type="button" aria-label="이전 구간" title="이전 구간" disabled={noData || !currentRange || !bounds || currentRange.start <= bounds.start} onClick={() => pan(-1)}><ArrowLeftIcon size={17} /></button>
        <button type="button" aria-label="다음 구간" title="다음 구간" disabled={noData || !currentRange || !bounds || currentRange.end >= bounds.end} onClick={() => pan(1)}><ArrowRightIcon size={17} /></button>
        <span className="toolbar-spacer" />
        <button type="button" aria-label="이상 구간으로 이동" disabled={noData || !selectedPoint} onClick={focusIncident}><CrosshairIcon size={17} /> 이상 구간</button>
        <button type="button" disabled={noData} onClick={() => updateRange(bounds, "full_range")}>전체 구간</button>
        <span className="render-stat">보존 {points.length.toLocaleString()}개 시점 / 표시 {sampled.length.toLocaleString()}개 · Canvas</span>
      </div>
      <div className="signal-window" aria-label="차트 표시 구간">
        <span>{viewRange ? rangeAdjusted ? "보관 중인 이력 범위로 이동" : "구간 고정" : `최근 ${chartMinutes}분, 실시간 갱신`}</span>
        <span>{currentRange ? `${formatTime(currentRange.start)}–${formatTime(currentRange.end)}` : "데이터 대기 중"}</span>
        <span>이상 발생 {formatTime(incident.startedAt)} ({zoneLabel})</span>
        <span>구간별 최솟값과 최댓값을 표시합니다. 작은 반복 피크나 지속 시간은 이 요약만으로 판단할 수 없습니다.</span>
      </div>
      <div className="signal-chart-wrap">
        {historyError ? (
          <div className="chart-error" role="alert">
            <WarningCircleIcon size={20} weight="fill" aria-hidden="true" />
            <span>
              <strong>최근 30분 센서 이력을 불러오지 못했습니다.</strong>
              실시간 수신 데이터만으로 원인을 판단하지 마세요.
            </span>
            <button type="button" onClick={onRetryHistory}>이력 다시 불러오기</button>
          </div>
        ) : null}
        {loading ? (
          <div className="chart-loading"><CircleNotchIcon size={28} className="spin" /> 센서 이력을 불러오는 중입니다…</div>
        ) : null}
        <div className="signal-chart" ref={chartRef} role="img" aria-label={profile.chartLabel} data-equipment-id={profile.equipmentId} />
      </div>
        {selectedPoint && !historyError && !loading ? (
          <dl className="current-values" data-panels={profile.panels.length} aria-label="이상 발생 시점 센서값">
            <div className="current-values__caption"><dt>이상 발생 시점 참고값</dt><dd>{formatTime(selectedPoint.timestamp)} 기준</dd></div>
            {profile.panels.map((panel) => <div key={panel.id} className={`current-values__pair ${panel.reference ? "current-values__temperature" : ""}`}>
              <dt>{panel.title}</dt>
              {panel.series.map((series) => <dd key={series.key}>{series.shortLabel ? `${series.shortLabel} ` : ""}{selectedPoint[series.key].toFixed(series.precision)} {panel.unit}</dd>)}
              {panel.reference ? <dd>설정값 {panel.reference.value.toFixed(1)} {panel.unit}</dd> : null}
            </div>)}
          </dl>
        ) : null}
    </section>
  );
}
