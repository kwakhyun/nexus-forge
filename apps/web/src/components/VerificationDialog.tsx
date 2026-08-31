import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { verificationChecklist, type Incident, type VerificationRequest } from "@nexus/contracts";
import { CheckCircleIcon, ClipboardTextIcon, ShieldCheckIcon, XIcon } from "@phosphor-icons/react";
import { Button } from "@nexus/ui";
import { api, ApiError } from "../api/client";
import { useTimeFormat } from "../hooks/useTimeFormat";
import { useOperationsStore } from "../store/operationsStore";
import { useWorkspaceStore } from "../store/workspaceStore";
import { ASSIGNEES, WORK_LABELS } from "../domain/workspace";
import { verificationStarted, verificationStored, verificationPresented } from "../observability/performanceProbe";

const defaultAssignee = "설비 보전팀 이민호";
const assignees = ASSIGNEES;

export function VerificationDialog({ incident, canIssue = true }: { incident: Incident; canIssue?: boolean }) {
  const checklist = verificationChecklist(incident.equipmentId);
  const { formatDateTime } = useTimeFormat();
  const workspaceStatus = useWorkspaceStore((state) => state.status);
  const localCase = useWorkspaceStore((state) => state.document.cases.find((item) => item.id === incident.id));
  const work = useWorkspaceStore((state) => state.document.workOrders.find((item) => item.incidentId === incident.id && !item.sample));
  const open = useOperationsStore((state) => state.verificationOpen);
  const setOpen = useOperationsStore((state) => state.setVerificationOpen);
  const setRecord = useOperationsStore((state) => state.setVerificationRecord);
  const setAttempt = useOperationsStore((state) => state.setVerificationAttempt);
  const record = useOperationsStore((state) => state.verificationRecord?.incidentId === incident.id ? state.verificationRecord : null);
  const attempt = useOperationsStore((state) => state.verificationAttempt?.incidentId === incident.id ? state.verificationAttempt : null);
  const otherAttempt = useOperationsStore((state) => state.verificationAttempt?.incidentId !== incident.id ? state.verificationAttempt : null);
  const otherEquipmentId = useWorkspaceStore((state) => state.document.cases.find((item) => item.id === otherAttempt?.incidentId)?.equipmentId);
  const role = useOperationsStore((state) => state.role);
  const dialogRef = useRef<HTMLDivElement>(null);
  const successHeadingRef = useRef<HTMLHeadingElement>(null);
  const pendingStatusRef = useRef<HTMLParagraphElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const busyRef = useRef(false);
  const [checked, setChecked] = useState(() => checklist.map((check) => attempt?.checks.includes(check) ?? false));
  const confirmedChecks = attempt ? checklist.map((check) => attempt.checks.includes(check)) : checked;
  const assignedDefault = localCase?.assignee || defaultAssignee;
  const [assignee, setAssignee] = useState(attempt?.assignee ?? assignedDefault);
  const isManager = role === "manager";
  const allowed = !otherAttempt && canIssue && incident.safeToVerifyWhileRunning && incident.status !== "resolved" && localCase?.status !== "resolved" && workspaceStatus === "ready";

  const mutation = useMutation({
    mutationFn: async (input: VerificationRequest) => {
      if (input.requestId) verificationStarted(input.requestId, incident.equipmentId);
      const dispatch = useWorkspaceStore.getState().dispatch;
      await dispatch({ type: "seed", incident });
      await dispatch({ type: "prepare-verification", request: input });
      const result = await api.createVerification(input);
      await dispatch({ type: "register-verification", record: result });
      if (input.requestId) verificationStored(input.requestId);
      return result;
    },
    onSuccess: (result) => {
      setRecord(result);
      setAttempt(null);
    },
    onError: async (error) => {
      // A definitive validation rejection can be edited. Ambiguous failures retry the same request.
      if (error instanceof ApiError && error.status && [400, 404].includes(error.status)) {
        setAttempt(null);
        await useWorkspaceStore.getState().dispatch({ type: "clear-verification" }).catch(() => undefined);
      }
    },
    onSettled: () => { busyRef.current = false; },
  });
  const resetMutation = mutation.reset;
  const locked = mutation.isPending || attempt !== null;
  const closeDialog = useCallback(() => {
    if (busyRef.current) return;
    if (!useOperationsStore.getState().verificationAttempt) {
      setChecked(checklist.map(() => false));
      setAssignee(defaultAssignee);
      resetMutation();
    }
    setOpen(false);
  }, [checklist, resetMutation, setOpen]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const background = Array.from(dialogRef.current?.closest(".app-frame")?.children ?? [])
      .filter((element): element is HTMLElement => element instanceof HTMLElement && !element.classList.contains("dialog-backdrop"));
    const previousInert = background.map((element) => element.inert);
    background.forEach((element) => { element.inert = true; });
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>("button:not([disabled])")?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDialog();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        dialogRef.current.focus();
      } else if (event.shiftKey && (!focusable.includes(document.activeElement as HTMLElement) || document.activeElement === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!focusable.includes(document.activeElement as HTMLElement) || document.activeElement === last)) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
      background.forEach((element, index) => { element.inert = previousInert[index] ?? false; });
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
    };
  }, [closeDialog, open]);

  useEffect(() => {
    if (!open) return;
    if (record) {
      successHeadingRef.current?.focus();
      if (record.requestId) verificationPresented(record.requestId);
    }
    else if (mutation.isPending) pendingStatusRef.current?.focus();
    else if (mutation.isError) errorRef.current?.focus();
  }, [record, mutation.isPending, mutation.isError, open]);

  if (!open) return null;

  const submit = () => {
    if (busyRef.current || !allowed || !confirmedChecks.every(Boolean) || record) return;
    const input = attempt ?? {
      requestId: crypto.randomUUID(),
      incidentId: incident.id,
      requestedBy: isManager ? "교대 관리자 박서진" : "라인 엔지니어 김현수",
      assignee: isManager ? assignee : assignedDefault,
      checks: [...checklist],
    };
    busyRef.current = true;
    setAttempt(input);
    mutation.mutate(input);
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) closeDialog();
    }}>
      <div className="verification-dialog" role="dialog" aria-modal="true" aria-labelledby="verification-title"
        aria-describedby={record ? "verification-result-summary" : "verification-description"} ref={dialogRef} tabIndex={-1}>
        <header>
          <div><ShieldCheckIcon size={22} weight="duotone" aria-hidden="true" /><span>현장 검증 작업 지시</span></div>
          <button type="button" onClick={closeDialog} disabled={mutation.isPending} aria-label="닫기"><XIcon size={19} /></button>
        </header>
        {record ? (
          <div className="verification-success" data-testid="verification-success">
            <CheckCircleIcon size={48} weight="duotone" aria-hidden="true" />
            <h2 id="verification-title" ref={successHeadingRef} tabIndex={-1}>현장 검증 작업 지시를 발행했습니다</h2>
            <p id="verification-result-summary">공개 데모의 발행 결과입니다. 실제 담당자에게는 전송되지 않습니다.</p>
            <dl className="verification-result">
              <div><dt>작업 지시</dt><dd>{record.id}</dd></div>
              <div><dt>담당자</dt><dd>{work?.assignee ?? record.assignee}</dd></div>
              <div><dt>요청자</dt><dd>{record.requestedBy}</dd></div>
              <div><dt>상태</dt><dd>{work && work.status !== "issued" ? WORK_LABELS[work.status] : "발행됨 (점검 대기)"}</dd></div>
              <div><dt>발행 시각</dt><dd>{formatDateTime(record.issuedAt)}</dd></div>
              <div><dt>완료 기한</dt><dd>{formatDateTime(record.dueAt)}</dd></div>
            </dl>
            <p className="session-note">이 브라우저에 저장한 결과입니다. 새로고침 후에도 정비 관리에서 확인하고 점검을 진행할 수 있습니다.</p>
            <Link className="verification-work-link" to={`/maintenance?work=${encodeURIComponent(record.id)}`} onClick={closeDialog}>정비 관리에서 점검 진행</Link>
            <Button onClick={closeDialog}>진단 화면으로 돌아가기</Button>
          </div>
        ) : (
          <>
            <div className="dialog-intro">
              <ClipboardTextIcon size={28} weight="duotone" aria-hidden="true" />
              <div>
                <h2 id="verification-title">{incident.equipmentId} 현장 검증</h2>
                <p id="verification-description">{isManager
                  ? "작업 담당자를 지정하고 안전 조건을 확인해 주세요."
                  : "기본 담당자와 안전 조건을 확인해 주세요."} 실제 설비 제어나 작업 전송은 이루어지지 않습니다.</p>
              </div>
            </div>
            <div className="assignment-field">
              {isManager ? <>
                <label htmlFor="verification-assignee">작업 담당자</label>
                <select id="verification-assignee" value={attempt?.assignee ?? assignee} disabled={locked} onChange={(event) => setAssignee(event.target.value)}>
                  {assignees.map((name) => <option value={name} key={name}>{name}</option>)}
                </select>
              </> : <><span className="assignment-field__label">{attempt ? "기존 요청 담당자" : "기본 담당자"}</span><strong className="assignment-field__value">{attempt?.assignee ?? assignedDefault}</strong></>}
            </div>
            <fieldset disabled={locked}>
              <legend>안전 조건 <span>모두 확인해야 발행할 수 있습니다</span></legend>
              {checklist.map((label, index) => (
                <label className="check-row" key={label}>
                  <input type="checkbox" checked={confirmedChecks[index]} onChange={(event) => setChecked((items) => items.map((item, itemIndex) => itemIndex === index ? event.target.checked : item))} />
                  <span>{label}</span>
                </label>
              ))}
            </fieldset>
            {otherAttempt ? <p className="form-error" role="alert">다른 설비의 작업 요청 결과를 먼저 확인해야 합니다. {otherEquipmentId ? <Link to={`/diagnostics/${otherEquipmentId}`} onClick={closeDialog}>해당 설비의 요청 확인</Link> : "이상 관리에서 요청한 설비를 확인해 주세요."}</p>
              : !allowed ? <p className="form-error" role="alert">최신 데이터 또는 안전 조건을 확인할 수 없어 발행을 보류합니다. 진단 화면의 안내를 확인해 주세요.</p> : null}
            {mutation.isPending ? <p className="form-status" role="status" tabIndex={-1} ref={pendingStatusRef}>작업 지시 발행 결과를 확인 중입니다. 중복 요청을 막기 위해 잠시 기다려 주세요.</p> : null}
            {mutation.isError || (attempt && !mutation.isPending) ? <p className="form-error" role="alert" tabIndex={-1} ref={errorRef}>발행 결과를 확인하지 못했습니다. {attempt ? "담당자와 안전 조건을 유지한 채 같은 요청으로 다시 확인합니다." : "입력 내용과 연결 상태를 확인한 뒤 다시 시도해 주세요."}</p> : null}
            <footer>
              <Button variant="secondary" disabled={mutation.isPending} onClick={closeDialog}>취소</Button>
              <Button disabled={!confirmedChecks.every(Boolean) || mutation.isPending || !allowed} aria-busy={mutation.isPending} onClick={submit}>
                {mutation.isPending ? "작업 지시 발행 중…" : attempt ? "같은 요청으로 다시 확인" : "검증 작업 지시 발행"}
              </Button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
