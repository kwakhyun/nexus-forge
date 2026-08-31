import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { GlobalRail } from "./GlobalRail";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

function mockRailLayout(overflow: boolean) {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(390);
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(overflow ? 520 : 390);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return this.matches(".global-rail")
      ? { left: 0, right: 390 } as DOMRect
      : { left: 432, right: 510 } as DOMRect;
  });
}

it("reveals the active mobile menu without moving focus", () => {
  mockRailLayout(true);
  const input = document.createElement("input");
  document.body.append(input);
  input.focus();
  render(<MemoryRouter initialEntries={["/settings"]}><GlobalRail /></MemoryRouter>);
  expect(screen.getByRole("navigation", { name: "제품 탐색" }).scrollLeft).toBe(128);
  expect(document.activeElement).toBe(input);
});

it("leaves a rail that already fits untouched", () => {
  mockRailLayout(false);
  render(<MemoryRouter initialEntries={["/settings"]}><GlobalRail /></MemoryRouter>);
  expect(screen.getByRole("navigation", { name: "제품 탐색" }).scrollLeft).toBe(0);
});

it("does not pick a different menu for a route without an active item", () => {
  mockRailLayout(true);
  render(<MemoryRouter initialEntries={["/diagnostics/DRYER-02"]}><GlobalRail /></MemoryRouter>);
  expect(screen.getByRole("navigation", { name: "제품 탐색" }).scrollLeft).toBe(0);
});
