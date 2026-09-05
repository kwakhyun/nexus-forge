const integer = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 });
import { groupProduction } from "../../domain/production";
import { useTimeFormat } from "../../hooks/useTimeFormat";


export function ProductionBars({
  buckets,
}: {
  buckets: ReturnType<typeof groupProduction>;
}) {
  const { formatDateTime } = useTimeFormat();
  const maximum = Math.max(1, ...buckets.map((item) => item.inspectedMeters));
  const column = 760 / Math.max(1, buckets.length);
  return (
    <svg
      className="production-bars"
      viewBox="0 0 820 230"
      role="img"
      aria-label="구간별 양품 및 불량 판정 길이. 정확한 값은 아래 생산 실적 표에서 확인할 수 있습니다."
    >
      <line x1="40" x2="800" y1="185" y2="185" stroke="#ced7e0" />
      {[0.5, 1].map((ratio) => (
        <g key={ratio}>
          <line
            x1="40"
            x2="800"
            y1={185 - ratio * 150}
            y2={185 - ratio * 150}
            stroke="#e7edf2"
          />
          <text
            x="36"
            y={189 - ratio * 150}
            textAnchor="end"
            fontSize="10"
            fill="#526573"
          >
            {((maximum * ratio) / 1_000).toFixed(0)}k
          </text>
        </g>
      ))}
      {buckets.map((item, index) => {
        const good = (item.acceptedMeters / maximum) * 150;
        const rejected = (item.rejectedMeters / maximum) * 150;
        const x = 40 + index * column + column * 0.15;
        return (
          <g key={item.startedAt}>
            <title>
              {`${formatDateTime(item.startedAt)}: ${item.runCount ? `양품 ${integer.format(item.acceptedMeters)}m, 불량 판정 ${integer.format(item.rejectedMeters)}m` : "집계 자료 없음"}`}
            </title>
            <rect
              x={x}
              y={185 - good}
              width={column * 0.7}
              height={good}
              fill="#356ae6"
              rx="2"
            />
            <rect
              x={x}
              y={185 - good - rejected}
              width={column * 0.7}
              height={rejected}
              fill="#a250b8"
            />
            {index % Math.max(1, Math.ceil(buckets.length / 6)) === 0 ? (
              <text
                x={x + column * 0.35}
                y="209"
                textAnchor="middle"
                fontSize="10"
                fill="#526573"
              >
                {formatDateTime(item.startedAt).slice(5)}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
