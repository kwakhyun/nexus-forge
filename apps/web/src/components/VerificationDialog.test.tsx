import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Incident } from "@nexus/contracts";
import { useOperationsStore } from "../store/operationsStore";
import { VerificationDialog } from "./VerificationDialog";

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

function renderDialog(role: "operator" | "manager") {
  useOperationsStore.setState({ role, verificationOpen: true, verificationRecord: null });
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <VerificationDialog incident={incident} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  useOperationsStore.setState({
    role: "operator",
    verificationOpen: false,
    verificationRecord: null,
  });
});

describe("verification role workflow", () => {
  it("uses the fixed maintenance assignee for a line engineer", () => {
    renderDialog("operator");

    expect(screen.getByText("기본 담당자")).toBeInTheDocument();
    expect(screen.getByText("설비 보전팀 이민호")).toBeInTheDocument();
    expect(screen.queryByLabelText("작업 담당자")).not.toBeInTheDocument();
  });

  it("lets a shift manager choose the work assignee", () => {
    renderDialog("manager");

    expect(screen.getByLabelText("작업 담당자")).toHaveValue("설비 보전팀 이민호");
    expect(screen.getByText(/작업 담당자를 지정하고 안전 조건을 확인해 주세요/)).toBeInTheDocument();
  });
});
