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

function renderDialog(role: "operator" | "manager", canIssue = true, open = true) {
  useOperationsStore.setState({ role, verificationOpen: open, verificationRecord: null, verificationAttempt: null });
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}><MemoryRouter>
      <VerificationDialog incident={incident} canIssue={canIssue} />
    </MemoryRouter></QueryClientProvider>,
  );
}

async function assignCase(assignee: string) {
  await act(async () => {
    await useWorkspaceStore.getState().dispatch({ type: "seed", incident });
    await useWorkspaceStore.getState().dispatch({ type: "assign", id: incident.id, assignee, actor: "교대 관리자" });
  });
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
  it("discards a canceled draft and issues to the saved assignee after reopening", async () => {
    await assignCase("공정 기술팀 최유진");
    const create = vi.spyOn(api, "createVerification").mockImplementation(async (input) => ({
      ...input, id: "WO-SAVED-ASSIGNEE", status: "issued", issuedAt: 1_000, dueAt: 2_000,
    }));
    renderDialog("manager");
    expect(screen.getByLabelText("작업 담당자")).toHaveValue("공정 기술팀 최유진");
    fireEvent.change(screen.getByLabelText("작업 담당자"), { target: { value: "코팅 2호 라인 정다은" } });
    fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    fireEvent.click(screen.getByRole("button", { name: "취소" }));

    act(() => useOperationsStore.getState().setVerificationOpen(true));
    expect(screen.getByLabelText("작업 담당자")).toHaveValue("공정 기술팀 최유진");
    screen.getAllByRole("checkbox").forEach((checkbox) => expect(checkbox).not.toBeChecked());
    screen.getAllByRole("checkbox").forEach((checkbox) => fireEvent.click(checkbox));
    fireEvent.click(screen.getByRole("button", { name: "검증 작업 지시 발행" }));

    await screen.findByTestId("verification-success");
    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0]![0].assignee).toBe("공정 기술팀 최유진");
    expect(useWorkspaceStore.getState().document.cases.find((item) => item.id === incident.id)?.assignee).toBe("공정 기술팀 최유진");
  });

  it("uses the persisted assignee when the workspace loads before the first opening", async () => {
    const saved = applyWorkspaceCommand(applyWorkspaceCommand(emptyWorkspace(), { type: "seed", incident }), {
      type: "assign", id: incident.id, assignee: "공정 기술팀 최유진", actor: "교대 관리자",
    });
    vi.spyOn(workspaceDatabase, "read").mockResolvedValue(saved);
    useWorkspaceStore.setState({ status: "loading" });
    renderDialog("manager", true, false);
    await act(async () => useWorkspaceStore.getState().load());

    act(() => useOperationsStore.getState().setVerificationOpen(true));
    expect(screen.getByLabelText("작업 담당자")).toHaveValue("공정 기술팀 최유진");
  });

  it("reflects a changed saved assignee on reopening and preserves an active selection", async () => {
    await assignCase("공정 기술팀 최유진");
    renderDialog("manager");
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    await assignCase("코팅 2호 라인 정다은");

    act(() => useOperationsStore.getState().setVerificationOpen(true));
    expect(screen.getByLabelText("작업 담당자")).toHaveValue("코팅 2호 라인 정다은");
    fireEvent.change(screen.getByLabelText("작업 담당자"), { target: { value: "공정 기술팀 최유진" } });
    await assignCase("설비 보전팀 이민호");
    expect(screen.getByLabelText("작업 담당자")).toHaveValue("공정 기술팀 최유진");
  });

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
    const lookup = vi.spyOn(api, "getVerification").mockImplementation(async (input) => ({ ...input, id: "WO-12345678", status: "issued", issuedAt: 1_000, dueAt: 2_000 }));
    renderDialog("manager");
    fireEvent.change(screen.getByLabelText("작업 담당자"), { target: { value: "코팅 2호 라인 정다은" } });
    screen.getAllByRole("checkbox").forEach((checkbox) => fireEvent.click(checkbox));
    fireEvent.click(screen.getByRole("button", { name: "검증 작업 지시 발행" }));
    const retry = await screen.findByRole("button", { name: "같은 요청으로 다시 확인" });
    await waitFor(() => expect(retry).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    act(() => useOperationsStore.getState().setVerificationOpen(true));
    expect(screen.getByLabelText("작업 담당자")).toHaveValue("코팅 2호 라인 정다은");
    expect(screen.getByLabelText("작업 담당자")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "같은 요청으로 다시 확인" }));
    await screen.findByTestId("verification-success");
    expect(inputs).toHaveLength(1);
    expect(lookup).toHaveBeenCalledWith(inputs[0]);
    expect(inputs[0]?.assignee).toBe("코팅 2호 라인 정다은");
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

async function preparePendingRequest() {
  const input = { requestId: "expired-review", incidentId: incident.id, requestedBy: "관리자", assignee: "설비 보전팀 이민호", checks: ["가동 중 점검"] };
  const { verificationChecklist } = await import("@nexus/contracts");
  input.checks = [...verificationChecklist(incident.equipmentId)];
  await act(async () => {
    await useWorkspaceStore.getState().dispatch({ type: "seed", incident });
    await useWorkspaceStore.getState().dispatch({ type: "prepare-verification", request: input });
    useOperationsStore.getState().setVerificationAttempt(input);
  });
  return input;
}

it("recovers an existing request when diagnostic evidence is no longer valid without issuing again", async () => {
  const create = vi.spyOn(api, "createVerification");
  const lookup = vi.spyOn(api, "getVerification").mockImplementation(async (input) => ({ ...input, id: "WO-RECOVER", status: "issued", issuedAt: 1_000, dueAt: 2_000 }));
  renderDialog("operator", false);
  const input = await preparePendingRequest();
  fireEvent.click(screen.getByRole("button", { name: "같은 요청으로 다시 확인" }));
  await screen.findByTestId("verification-success");
  expect(lookup).toHaveBeenCalledWith(input);
  expect(create).not.toHaveBeenCalled();
  expect(useWorkspaceStore.getState().document.pendingVerification).toBeNull();
});

it("keeps unknown results pending until the user explicitly ends tracking and records that uncertainty", async () => {
  vi.spyOn(api, "getVerification").mockResolvedValue(null);
  const create = vi.spyOn(api, "createVerification");
  renderDialog("operator", false);
  await preparePendingRequest();
  fireEvent.click(screen.getByRole("button", { name: "같은 요청으로 다시 확인" }));
  const end = await screen.findByRole("button", { name: "미확정 요청 추적 종료" });
  expect(end).toBeDisabled();
  expect(useWorkspaceStore.getState().document.pendingVerification).not.toBeNull();
  fireEvent.click(screen.getByRole("checkbox", { name: "발행 여부가 미확정이며 작업 취소가 아님을 확인했습니다" }));
  fireEvent.click(end);
  await waitFor(() => expect(useWorkspaceStore.getState().document.pendingVerification).toBeNull());
  expect(useWorkspaceStore.getState().document.cases.find((item) => item.id === incident.id)?.activity.at(-1)?.message).toContain("발행 여부 미확정");
  expect(create).not.toHaveBeenCalled();
});
