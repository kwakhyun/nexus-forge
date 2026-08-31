import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { Incident, VerificationRecord, VerificationRequest } from "@nexus/contracts";
import { useOperationsStore } from "../store/operationsStore";
import { VerificationDialog } from "./VerificationDialog";
import { api } from "../api/client";
import { useWorkspaceStore } from "../store/workspaceStore";
import { workspaceDatabase } from "../lib/workspaceDatabase";
import { applyWorkspaceCommand, emptyWorkspace } from "../domain/workspace";

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
  useOperationsStore.setState({ role, verificationOpen: true, verificationRecord: null, verificationAttempt: null });
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}><MemoryRouter>
      <VerificationDialog incident={incident} />
    </MemoryRouter></QueryClientProvider>,
  );
}

beforeEach(() => {
  let document = emptyWorkspace();
  useWorkspaceStore.setState({ document, status: "ready", error: null, pending: 0 });
  vi.spyOn(workspaceDatabase, "apply").mockImplementation(async (command) => { document = applyWorkspaceCommand(document, command); return document; });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useOperationsStore.setState({
    role: "operator",
    verificationOpen: false,
    verificationRecord: null,
    verificationAttempt: null,
  });
  useWorkspaceStore.setState({ document: emptyWorkspace(), status: "loading", error: null, pending: 0 });
});

describe("verification role workflow", () => {
  it("locks pending requests and preserves the issued result after reopening", async () => {
    let resolve!: (record: VerificationRecord) => void;
    const create = vi.spyOn(api, "createVerification").mockImplementation(() => new Promise((done) => { resolve = done; }));
    renderDialog("manager");
    screen.getAllByRole("checkbox").forEach((checkbox) => fireEvent.click(checkbox));
    fireEvent.click(screen.getByRole("button", { name: "검증 작업 지시 발행" }));
    await waitFor(() => expect(create).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByRole("button", { name: "취소" })).toBeDisabled());
    expect(screen.getByLabelText("작업 담당자")).toBeDisabled();
    screen.getAllByRole("checkbox").forEach((checkbox) => expect(checkbox).toBeDisabled());
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    const input = create.mock.calls[0]![0];
    await act(async () => resolve({ ...input, id: "WO-12345678", status: "issued", issuedAt: 1_000, dueAt: 2_000 }));
    await screen.findByTestId("verification-success");
    fireEvent.click(screen.getByRole("button", { name: "진단 화면으로 돌아가기" }));
    act(() => useOperationsStore.getState().setVerificationOpen(true));
    expect(screen.getByTestId("verification-success")).toHaveTextContent("WO-12345678");
    expect(screen.queryByRole("button", { name: "검증 작업 지시 발행" })).not.toBeInTheDocument();
    expect(create).toHaveBeenCalledOnce();
  });

  it("retries ambiguous failures using the same immutable payload", async () => {
    const inputs: VerificationRequest[] = [];
    vi.spyOn(api, "createVerification").mockImplementation(async (input) => {
      inputs.push(input);
      if (inputs.length === 1) throw new Error("response lost");
      return { ...input, id: "WO-12345678", status: "issued", issuedAt: 1_000, dueAt: 2_000 };
    });
    renderDialog("manager");
    screen.getAllByRole("checkbox").forEach((checkbox) => fireEvent.click(checkbox));
    fireEvent.click(screen.getByRole("button", { name: "검증 작업 지시 발행" }));
    const retry = await screen.findByRole("button", { name: "같은 요청으로 다시 확인" });
    await waitFor(() => expect(retry).toBeEnabled());
    fireEvent.click(retry);
    await screen.findByTestId("verification-success");
    expect(inputs).toHaveLength(2);
    expect(inputs[0]).toEqual(inputs[1]);
    expect(inputs[0]?.requestId).toBeTruthy();
  });

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
