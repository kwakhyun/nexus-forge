import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ProcessStage } from "@nexus/contracts";
import { ProcessStrip } from "./ProcessStrip";

const stages: ProcessStage[] = [
  { id: "mixing", name: "MIXING", status: "normal", equipmentCount: 2 },
  { id: "coating", name: "COATING", status: "critical", equipmentCount: 3 },
  { id: "pressing", name: "PRESSING", status: "normal", equipmentCount: 2 },
  { id: "slitting", name: "SLITTING", status: "normal", equipmentCount: 2 },
];

describe("ProcessStrip", () => {
  it("marks coating as the selected critical step", () => {
    render(<ProcessStrip stages={stages} />);

    const coating = screen.getByRole("button", { name: /COATING/ });
    expect(coating).toHaveAttribute("aria-current", "step");
    expect(coating).toHaveTextContent("복합 이상 감지");
    expect(screen.getByRole("navigation", { name: "공정 단계" })).toBeInTheDocument();
  });
});
