import { beforeEach, describe, expect, it } from "vitest";
import { useWorkspaceDraftStore } from "./workspaceDraftStore";
import { listenForWorkspaceChanges, useWorkspaceStore } from "./workspaceStore";

beforeEach(() => {
  useWorkspaceDraftStore.getState().clearAll();
  useWorkspaceStore.setState({ pending: 0 });
});
describe("tab-local unsubmitted inputs", () => {
  it("stores only edited fields and preserves the original comparison value", () => {
    const store = useWorkspaceDraftStore.getState();
    store.update(
      "settings",
      { chartMinutes: 30, timeZone: "Asia/Seoul" },
      { chartMinutes: 5 },
    );
    store.update(
      "settings",
      { chartMinutes: 15, timeZone: "UTC" },
      { chartMinutes: 30 },
    );
    expect(useWorkspaceDraftStore.getState().entries.settings).toEqual({
      baseline: { chartMinutes: 30 },
      changes: { chartMinutes: 30 },
    });
    store.update(
      "settings",
      { chartMinutes: 15, timeZone: "UTC" },
      { chartMinutes: 15 },
    );
    expect(useWorkspaceDraftStore.getState().entries).toEqual({});
  });
  it("keeps record drafts independent and clears only the requested input", () => {
    const store = useWorkspaceDraftStore.getState();
    store.update("completion:a", { note: "" }, { note: "확인한 점검 결과" });
    store.update("resolution:b", { note: "" }, { note: "확인한 종결 사유" });
    store.clear("completion:a");
    expect(Object.keys(useWorkspaceDraftStore.getState().entries)).toEqual([
      "resolution:b",
    ]);
    store.clearAll();
    expect(useWorkspaceDraftStore.getState().entries).toEqual({});
  });
  it("requests an exit warning for unsaved input even when no DB write is pending", () => {
    const stop = listenForWorkspaceChanges();
    useWorkspaceDraftStore
      .getState()
      .update("completion:a", { note: "" }, { note: "작성 중" });
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    useWorkspaceDraftStore.getState().clearAll();
    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
    stop();
  });
});
