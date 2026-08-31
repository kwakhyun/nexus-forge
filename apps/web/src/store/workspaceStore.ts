import { create } from "zustand";
import {
  emptyWorkspace,
  WorkflowError,
  type WorkspaceCommand,
  type WorkspaceDocument,
} from "../domain/workspace";
import { workspaceDatabase } from "../lib/workspaceDatabase";
import { useWorkspaceDraftStore } from "./workspaceDraftStore";

interface WorkspaceState {
  document: WorkspaceDocument;
  status: "loading" | "ready" | "error";
  error: string | null;
  pending: number;
  load: () => Promise<void>;
  dispatch: (command: WorkspaceCommand) => Promise<WorkspaceDocument>;
  reset: () => Promise<void>;
}

const channelName = "nexus-forge-workspace-v1";
function openChangeChannel(): BroadcastChannel | null {
  try {
    return typeof BroadcastChannel === "undefined"
      ? null
      : new BroadcastChannel(channelName);
  } catch {
    // A privacy policy may block messaging even when IndexedDB is available.
    return null;
  }
}
function announceChange() {
  const channel = openChangeChannel();
  if (!channel) return;
  try {
    channel.postMessage("updated");
  } catch {
    // Best-effort notification must not turn a committed write into a reported failure.
  } finally {
    channel.close();
  }
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => {
  const accept = (document: WorkspaceDocument) =>
    set((state) => ({
      document:
        document.revision >= state.document.revision
          ? document
          : state.document,
      status: "ready",
      error: null,
    }));
  const fail = (error: unknown) => {
    if (!(error instanceof WorkflowError))
      set({
        status: "error",
        error:
          error instanceof Error
            ? error.message
            : "저장 기록을 확인하지 못했습니다.",
      });
  };
  return {
    document: emptyWorkspace(),
    status: "loading",
    error: null,
    pending: 0,
    load: async () => {
      try {
        accept(await workspaceDatabase.read());
      } catch (error) {
        fail(error);
      }
    },
    dispatch: async (command) => {
      set({ pending: get().pending + 1 });
      try {
        const document = await workspaceDatabase.apply(command);
        const changed = document.revision > get().document.revision;
        accept(document);
        if (changed) announceChange();
        return document;
      } catch (error) {
        fail(error);
        throw error;
      } finally {
        set({ pending: get().pending - 1 });
      }
    },
    reset: async () => {
      set({ pending: get().pending + 1 });
      try {
        accept(await workspaceDatabase.reset());
        announceChange();
      } catch (error) {
        fail(error);
        throw error;
      } finally {
        set({ pending: get().pending - 1 });
      }
    },
  };
});

export function listenForWorkspaceChanges(): () => void {
  const refresh = () => {
    void useWorkspaceStore.getState().load();
  };
  const guardPendingWrite = (event: BeforeUnloadEvent) => {
    if (
      useWorkspaceStore.getState().pending === 0 &&
      !Object.keys(useWorkspaceDraftStore.getState().entries).length
    )
      return;
    event.preventDefault();
    event.returnValue = "";
  };
  const channel = openChangeChannel();
  if (channel) channel.onmessage = refresh;
  window.addEventListener("focus", refresh);
  window.addEventListener("beforeunload", guardPendingWrite);
  return () => {
    channel?.close();
    window.removeEventListener("focus", refresh);
    window.removeEventListener("beforeunload", guardPendingWrite);
  };
}
