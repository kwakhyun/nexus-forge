import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ProcessStage } from "@nexus/contracts";
import { ProcessStrip } from "./ProcessStrip";

const stages: ProcessStage[] = [
  { id: "mixing", name: "믹싱", status: "normal", equipmentCount: 2 },
  { id: "coating", name: "코팅", status: "critical", equipmentCount: 3 },
  { id: "pressing", name: "롤 프레싱", status: "normal", equipmentCount: 2 },
  { id: "slitting", name: "슬리팅", status: "normal", equipmentCount: 2 },
];

describe("ProcessStrip", () => {
  it("marks coating as the selected critical step", () => {
    render(<ProcessStrip stages={stages} />);

    const coating = screen.getByRole("button", { name: /코팅/ });
    expect(coating).toHaveAttribute("aria-current", "step");
    expect(coating).toHaveTextContent("복합 이상");
    expect(screen.getByRole("navigation", { name: "공정 단계" })).toBeInTheDocument();
  });
});
