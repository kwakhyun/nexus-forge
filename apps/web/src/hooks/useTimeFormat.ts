import { useMemo } from "react";
import { formatDateTime, formatTime } from "../lib/format";
import { useWorkspaceStore } from "../store/workspaceStore";

export function useTimeFormat() {
  const timeZone = useWorkspaceStore(
    (state) => state.document.settings.timeZone,
  );
  return useMemo(
    () => ({
      timeZone,
      zoneLabel: timeZone === "UTC" ? "UTC" : "KST",
      formatTime: (value: number) => formatTime(value, timeZone),
      formatDateTime: (value: number) => formatDateTime(value, timeZone),
    }),
    [timeZone],
  );
}
