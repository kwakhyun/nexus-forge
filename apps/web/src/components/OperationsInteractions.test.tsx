import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Incident, PlantSummary } from "@nexus/contracts";
import { EquipmentTree } from "./EquipmentTree";
import { EventTimeline } from "./EventTimeline";
import { OverviewMap } from "./OverviewMap";
import { CauseRail } from "./CauseRail";

const incident: Incident = {
  id: "INC-TEST",
  equipmentId: "COATER-02",
  title: "복합 이상 감지",
  startedAt: 1_000_000,
  predictedImpactAt: 2_000_000,
  confidence: 0.92,
  causalChain: ["댄서 롤 위치 편차", "웹 장력 상승", "엣지 웨이브 결함"],
  evidence: [],
  safeToVerifyWhileRunning: true,
  status: "open",
};

const summary: PlantSummary = {
  plantId: "BATTERY-01",
  plantName: "배터리 1공장",
  lineId: "COATING-LINE-02",
  lineName: "코팅 2호 라인",
  streamLatencyMs: 420,
  updatedAt: 1_000_000,
  stages: [
    { id: "mixing", name: "믹싱", status: "normal", equipmentCount: 2 },
    { id: "coating", name: "코팅", status: "critical", equipmentCount: 6 },
    { id: "pressing", name: "롤 프레싱", status: "normal", equipmentCount: 2 },
    { id: "slitting", name: "슬리팅", status: "normal", equipmentCount: 2 },
  ],
  equipment: [
    { id: "UNW-01", name: "UNW-01", stage: "coating", status: "normal" },
    { id: "MIX-01", name: "MIX-01", stage: "mixing", status: "normal" },
    { id: "COATER-01", name: "COATER-01", stage: "coating", status: "normal" },
    { id: "DRYER-01", name: "DRYER-01", stage: "coating", status: "normal" },
    { id: "CAL-01", name: "CAL-01", stage: "pressing", status: "normal" },
    { id: "REW-01", name: "REW-01", stage: "slitting", status: "normal" },
    { id: "UNW-02", name: "UNW-02", stage: "coating", status: "normal" },
    { id: "MIX-02", name: "MIX-02", stage: "mixing", status: "normal" },
    { id: "COATER-02", name: "COATER-02", stage: "coating", status: "critical" },
    { id: "DRYER-02", name: "DRYER-02", stage: "coating", status: "warning" },
    { id: "CAL-02", name: "CAL-02", stage: "pressing", status: "normal" },
    { id: "REW-02", name: "REW-02", stage: "slitting", status: "normal" },
  ],
  activeIncident: incident,
};

afterEach(cleanup);

describe("operations interactions", () => {
  it("derives overview equipment and status totals from the plant summary", () => {
    const onSelectEquipment = vi.fn();
    render(<OverviewMap summary={summary} onSelectEquipment={onSelectEquipment} />);

    expect(screen.getByText("정상 10")).toBeInTheDocument();
    expect(screen.getByText("경고 1")).toBeInTheDocument();
    expect(screen.getByText("이상 1")).toBeInTheDocument();
    expect(screen.getByLabelText("DRYER-02 경고")).toBeInTheDocument();
    expect(screen.queryByText("COATER-03")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "COATER-02 이상 신호 진단 열기" }));
    expect(onSelectEquipment).toHaveBeenCalledWith("COATER-02");
  });

  it("searches and filters equipment, then collapses the tree", () => {
    const onToggleCollapsed = vi.fn();
    render(
      <EquipmentTree
        summary={summary}
        selectedId="COATER-02"
        collapsed={false}
        onToggleCollapsed={onToggleCollapsed}
      />,
    );

    fireEvent.change(screen.getByLabelText("설비 검색"), { target: { value: "DRYER-02" } });
    expect(screen.getByText("DRYER-02")).toBeInTheDocument();
    expect(screen.queryByText("COATER-02")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("설비 검색"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "설비 상태 필터" }));
    fireEvent.change(screen.getByLabelText("설비 상태"), { target: { value: "warning" } });
    const tree = screen.getByRole("complementary", { name: "설비 목록" });
    expect(within(tree).getByText("DRYER-02")).toBeInTheDocument();
    expect(within(tree).queryByText("COATER-02")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "설비 목록 접기" }));
    expect(onToggleCollapsed).toHaveBeenCalledOnce();
  });

  it("filters events and adds an operator annotation", () => {
    render(<EventTimeline incident={incident} />);

    fireEvent.click(screen.getByLabelText("경고"));
    expect(screen.queryByText("웹 장력 상승 추세 감지")).not.toBeInTheDocument();
    expect(screen.getByText("비전 검사 결함률 급증")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "주석 추가" }));
    fireEvent.change(screen.getByLabelText("현장 관찰 내용"), { target: { value: "댄서 롤 진동 확인" } });
    fireEvent.click(screen.getByRole("button", { name: "타임라인에 추가" }));
    expect(screen.getByText("작업자 주석: 댄서 롤 진동 확인")).toBeInTheDocument();
  });

  it("withholds confidence and verification actions until history is verified", () => {
    const onStartVerification = vi.fn();
    const { rerender } = render(
      <CauseRail incident={incident} diagnosticsStatus="error" onStartVerification={onStartVerification} />,
    );

    expect(screen.getByText("분석 보류")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar", { name: "원인 분석 신뢰도" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("원인 판단과 현장 검증을 진행할 수 없습니다");
    expect(screen.getByRole("button", { name: "이력 복구 후 진행" })).toBeDisabled();

    rerender(<CauseRail incident={incident} diagnosticsStatus="ready" onStartVerification={onStartVerification} />);

    expect(screen.getByText("92%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "원인 분석 신뢰도" })).toHaveAttribute("aria-valuenow", "92");
    fireEvent.click(screen.getByRole("button", { name: "현장 검증 시작" }));
    expect(onStartVerification).toHaveBeenCalledOnce();
  });
});
