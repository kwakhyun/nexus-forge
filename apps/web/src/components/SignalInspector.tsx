import type { SensorPoint } from "@nexus/contracts";
import { useState } from "react";
import type { DiagnosticProfile } from "../domain/diagnosticProfiles";
import { useTimeFormat } from "../hooks/useTimeFormat";

interface Props {
  points: SensorPoint[];
  profile: DiagnosticProfile;
  unavailable: boolean;
  selected: Record<string, boolean>;
  onToggle: (label: string, checked: boolean) => void;
}

/** Native controls expose the canvas legend and point values without rendering the entire history. */
export function SignalInspector({ points, profile, unavailable, selected, onToggle }: Props) {
  const [open, setOpen] = useState(false);
  return <details className="signal-inspector" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>신호 표시와 시점별 값 확인</summary>
    {open ? <>
      <fieldset>
        <legend>차트에 표시할 신호</legend>
        {profile.panels.flatMap((panel) => [
          ...(panel.reference ? [panel.reference.label] : []), ...panel.series.map((series) => series.label),
        ]).map((label) => <label key={label}><input type="checkbox" checked={selected[label] !== false}
          onChange={(event) => onToggle(label, event.target.checked)} />{label}</label>)}
      </fieldset>
      {unavailable || !points.length ? <p role="status">센서 이력을 확인한 뒤 시점별 값을 조회할 수 있습니다.</p>
        : <PointValues points={points} profile={profile} />}
    </> : null}
  </details>;
}

function PointValues({ points, profile }: Pick<Props, "points" | "profile">) {
  const { formatTime, zoneLabel } = useTimeFormat();
  const [timestamp, setTimestamp] = useState(() => points.at(-1)!.timestamp);
  let low = 0;
  let high = points.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (points[middle]!.timestamp < timestamp) low = middle + 1;
    else high = middle;
  }
  const index = low;
  const point = points[index]!;
  const expired = timestamp < points[0]!.timestamp;
  return <div className="signal-point-values">
    <label htmlFor="signal-point">조회 시점 ({zoneLabel})</label>
    <input id="signal-point" type="range" min={0} max={points.length - 1} step={1} value={index}
      aria-valuetext={formatTime(point.timestamp)} onChange={(event) => setTimestamp(points[Number(event.target.value)]!.timestamp)} />
    <div className="signal-point-navigation">
      <button type="button" disabled={index === 0} onClick={() => setTimestamp(points[index - 1]!.timestamp)}>이전 시점</button>
      <button type="button" disabled={index === points.length - 1} onClick={() => setTimestamp(points[index + 1]!.timestamp)}>다음 시점</button>
      <button type="button" onClick={() => setTimestamp(points.at(-1)!.timestamp)}>최신 시점</button>
    </div>
    {expired ? <p role="status">선택한 시점의 이력이 만료되어 가장 오래된 보관 시점을 표시합니다.</p> : null}
    <table>
      <caption>{formatTime(point.timestamp)} 센서값 ({zoneLabel})</caption>
      <thead><tr><th scope="col">신호</th><th scope="col">값</th></tr></thead>
      <tbody>{profile.panels.flatMap((panel) => [
        ...(panel.reference ? [<tr key={`${panel.id}-reference`}><th scope="row">{panel.reference.label}</th><td>{panel.reference.value.toFixed(1)} {panel.unit}</td></tr>] : []),
        ...panel.series.map((series) => <tr key={series.key}><th scope="row">{series.label}</th><td>{point[series.key].toFixed(series.precision)} {panel.unit}</td></tr>),
      ])}</tbody>
    </table>
    <p>보존된 시점에서 조회합니다. 고밀도 이력은 극값을 보존한 요약이며, 차트에서 숨긴 신호도 표에 포함합니다.</p>
  </div>;
}
