const timeOptions: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
};

const dateTimeOptions: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
};
const formatters = new Map<string, Intl.DateTimeFormat>();
function getFormatter(timeZone: string, date: boolean) {
  const key = `${timeZone}-${date}`;
  if (!formatters.has(key)) formatters.set(key, new Intl.DateTimeFormat("ko-KR", { ...(date ? dateTimeOptions : timeOptions), timeZone }));
  return formatters.get(key)!;
}

export function formatTime(value: number, timeZone = "Asia/Seoul"): string {
  return getFormatter(timeZone, false).format(value);
}

export function formatDateTime(value: number, timeZone = "Asia/Seoul"): string {
  const parts = Object.fromEntries(getFormatter(timeZone, true).formatToParts(value).map((part) => [part.type, part.value]));
  return `${parts.year}.${parts.month}.${parts.day} ${parts.hour}:${parts.minute}`;
}

export function formatDurationFrom(value: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - value) / 1_000));
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}분 ${remaining}초`;
}

export function formatRemainingMinutes(value: number, now = Date.now()): string {
  const minutes = Math.max(0, Math.ceil((value - now) / 60_000));
  return String(minutes);
}

export function getImpactDisplay(value: number, now: number) {
  return value <= now
    ? { label: "예상 영향 시각", value: "경과", unit: "", summary: "예상 영향 시각이 지났습니다. 실제 확산 여부는 확인되지 않았습니다." }
    : { label: "예상 불량 확산까지", value: formatRemainingMinutes(value, now), unit: "분", summary: "시뮬레이션 시나리오의 예상 시간입니다." };
}
