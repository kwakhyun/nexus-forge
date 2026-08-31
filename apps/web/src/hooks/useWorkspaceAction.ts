import { useRef, useState } from "react";
import { useWorkspaceStore } from "../store/workspaceStore";
import type { WorkspaceCommand } from "../domain/workspace";

export function useWorkspaceAction() {
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const ready = useWorkspaceStore((state) => state.status === "ready");
  const run = async (command: WorkspaceCommand, success: string) => {
    if (locked.current) return false;
    locked.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await useWorkspaceStore.getState().dispatch(command);
      setMessage(success);
      return true;
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "변경 사항을 저장하지 못했습니다.",
      );
      return false;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  const clearFeedback = () => {
    setError("");
    setMessage("");
  };
  return { busy, error, message, ready, run, clearFeedback };
}
