const timeFormatter = new Intl.DateTimeFormat("ko-KR", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const dateTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatTime(value: number): string {
  return timeFormatter.format(value);
}

export function formatDateTime(value: number): string {
  return dateTimeFormatter.format(value).replace(/\. /g, ".").replace(". ", " ");
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
