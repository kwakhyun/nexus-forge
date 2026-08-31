import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyWorkspace } from "../domain/workspace";
import { workspaceDatabase } from "../lib/workspaceDatabase";
import { listenForWorkspaceChanges, useWorkspaceStore } from "./workspaceStore";

beforeEach(() => {
  useWorkspaceStore.setState({
    document: emptyWorkspace(),
    status: "ready",
    error: null,
    pending: 0,
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("workspace change notification fallback", () => {
  it("warns about leaving only while a database write is pending", () => {
    const stop = listenForWorkspaceChanges();
    useWorkspaceStore.setState({ pending: 1 });
    const pendingExit = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(pendingExit);
    expect(pendingExit.defaultPrevented).toBe(true);
    useWorkspaceStore.setState({ pending: 0 });
    const savedExit = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(savedExit);
    expect(savedExit.defaultPrevented).toBe(false);
    stop();
  });
  it("keeps a committed save successful when cross-tab messaging is blocked", async () => {
    vi.stubGlobal(
      "BroadcastChannel",
      class {
        constructor() {
          throw new DOMException("Messaging blocked", "SecurityError");
        }
      },
    );
    const document = { ...emptyWorkspace(), revision: 1 };
    vi.spyOn(workspaceDatabase, "apply").mockResolvedValue(document);
    await expect(
      useWorkspaceStore.getState().dispatch({ type: "read-all" }),
    ).resolves.toEqual(document);
    expect(useWorkspaceStore.getState()).toMatchObject({
      status: "ready",
      error: null,
      pending: 0,
      document,
    });
  });

  it("refreshes on focus and cleans up even when the channel cannot open", async () => {
    vi.stubGlobal(
      "BroadcastChannel",
      class {
        constructor() {
          throw new DOMException("Messaging blocked", "SecurityError");
        }
      },
    );
    const read = vi
      .spyOn(workspaceDatabase, "read")
      .mockResolvedValue(emptyWorkspace());
    const stop = listenForWorkspaceChanges();
    window.dispatchEvent(new Event("focus"));
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    stop();
    window.dispatchEvent(new Event("focus"));
    expect(read).toHaveBeenCalledTimes(1);
  });
});
