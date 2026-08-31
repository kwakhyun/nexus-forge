import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useWorkspaceDraft } from "./useWorkspaceDraft";
import { useWorkspaceDraftStore } from "../store/workspaceDraftStore";

afterEach(() => {
  cleanup();
  useWorkspaceDraftStore.getState().clearAll();
});

it("preserves unsubmitted text when an external status change makes the record read-only", () => {
  const hook = renderHook(
    ({ editable }) =>
      useWorkspaceDraft("completion:test", { note: "" }, editable),
    { initialProps: { editable: true } },
  );
  act(() =>
    hook.result.current.update({
      note: "이 탭에서 아직 제출하지 않은 점검 결과입니다.",
    }),
  );
  hook.rerender({ editable: false });
  expect(hook.result.current.value.note).toBe(
    "이 탭에서 아직 제출하지 않은 점검 결과입니다.",
  );
  expect(hook.result.current.dirty).toBe(true);
  act(() => hook.result.current.update({ note: "읽기 전용 전환 후 새 입력" }));
  expect(hook.result.current.value.note).toBe(
    "이 탭에서 아직 제출하지 않은 점검 결과입니다.",
  );
  act(() => hook.result.current.clear());
  expect(hook.result.current.dirty).toBe(false);
});
