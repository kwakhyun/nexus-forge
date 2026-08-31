import { afterEach, expect, it, vi } from "vitest";
import { focusRecordHeading } from "./useRecordSelection";

afterEach(() => document.body.replaceChildren());

it("focuses the selected record at the top, where its details can be read", () => {
  const panel = document.createElement("section");
  const heading = document.createElement("h2");
  heading.tabIndex = -1;
  heading.textContent = "설비 점검 상세";
  heading.scrollIntoView = vi.fn();
  panel.append(heading);
  document.body.append(panel);

  focusRecordHeading(panel);

  expect(document.activeElement).toBe(heading);
  expect(heading.scrollIntoView).toHaveBeenCalledWith({ block: "start" });
});

it("ignores a missing panel or heading", () => {
  expect(() => focusRecordHeading(null)).not.toThrow();
  expect(() => focusRecordHeading(document.createElement("section"))).not.toThrow();
});
