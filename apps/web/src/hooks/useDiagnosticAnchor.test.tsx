import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useDiagnosticAnchor } from "./useDiagnosticAnchor";

const frames = new Map<number, FrameRequestCallback>();
let nextFrame = 0;

function AnchorFixture({ hash, ready = true, equipmentId = "COATER-02" }: { hash: string; ready?: boolean; equipmentId?: string }) {
  useDiagnosticAnchor(hash, ready, equipmentId);
  return ready ? <>
    <button>이전 조작</button>
    <h2 id="evidence-heading" tabIndex={-1}>주요 근거</h2>
    <h2 id="action-heading" tabIndex={-1}>권장 조치</h2>
    <h2 id="event-title" tabIndex={-1}>이벤트</h2>
  </> : <p>불러오는 중</p>;
}

function flushFrames() {
  const pending = [...frames.values()];
  frames.clear();
  act(() => { for (const callback of pending) callback(0); });
}

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = ++nextFrame;
    frames.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
});

afterEach(() => {
  cleanup();
  frames.clear();
  vi.unstubAllGlobals();
});

it.each([
  ["#evidence", "주요 근거"],
  ["#recommended-action", "권장 조치"],
  ["#event-title", "이벤트"],
])("focuses and reveals %s after its panel renders", (hash, name) => {
  render(<AnchorFixture hash={hash} />);
  const target = screen.getByRole("heading", { name });
  target.scrollIntoView = vi.fn();
  flushFrames();
  expect(target).toHaveFocus();
  expect(target.scrollIntoView).toHaveBeenCalledWith({ block: "start" });
});

it("waits for a direct-link destination to finish loading without stealing focus on later rerenders", () => {
  const view = render(<AnchorFixture hash="#recommended-action" ready={false} />);
  expect(frames.size).toBe(0);
  view.rerender(<AnchorFixture hash="#recommended-action" />);
  const target = screen.getByRole("heading", { name: "권장 조치" });
  target.scrollIntoView = vi.fn();
  flushFrames();
  expect(target).toHaveFocus();
  const button = screen.getByRole("button");
  button.focus();
  view.rerender(<AnchorFixture hash="#recommended-action" />);
  flushFrames();
  expect(button).toHaveFocus();
  expect(target.scrollIntoView).toHaveBeenCalledTimes(1);
});

it("cancels the old destination on a fast hash change", () => {
  const view = render(<AnchorFixture hash="#evidence" />);
  view.rerender(<AnchorFixture hash="#recommended-action" />);
  const target = screen.getByRole("heading", { name: "권장 조치" });
  target.scrollIntoView = vi.fn();
  flushFrames();
  expect(target).toHaveFocus();
});

it("ignores unknown fragments and cancels navigation when unmounted", () => {
  const view = render(<AnchorFixture hash="#not-a-diagnostic-section" />);
  expect(frames.size).toBe(0);
  view.rerender(<AnchorFixture hash="#evidence" />);
  expect(frames.size).toBe(1);
  view.unmount();
  expect(frames.size).toBe(0);
});
