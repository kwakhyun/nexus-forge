import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { Incident } from "@nexus/contracts";
import {
  CheckCircleIcon,
  ClipboardTextIcon,
  ShieldCheckIcon,
  XIcon,
} from "@phosphor-icons/react";
import { Button } from "@nexus/ui";
import { api } from "../api/client";
import { formatDateTime } from "../lib/format";
import { useOperationsStore } from "../store/operationsStore";

interface VerificationDialogProps {
  incident: Incident;
}

const checklist = [
  "댄서 롤 안전 가드와 작업 동선에 이상이 없는지 확인했습니다.",
  "라인 속도가 76 m/min으로 유지되는지 확인했습니다.",
  "현장 작업자에게 점검 목적과 절차를 공유했습니다.",
];

const defaultAssignee = "설비 보전팀 이민호";
const assignees = [
  defaultAssignee,
  "공정 기술팀 최유진",
  "코팅 2호 라인 정다은",
];

export function VerificationDialog({ incident }: VerificationDialogProps) {
  const open = useOperationsStore((state) => state.verificationOpen);
  const setOpen = useOperationsStore((state) => state.setVerificationOpen);
  const setRecord = useOperationsStore((state) => state.setVerificationRecord);
  const role = useOperationsStore((state) => state.role);
  const dialogRef = useRef<HTMLDivElement>(null);
  const successHeadingRef = useRef<HTMLHeadingElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const [checked, setChecked] = useState<boolean[]>(() => checklist.map(() => false));
  const [assignee, setAssignee] = useState(defaultAssignee);

  const mutation = useMutation({
    mutationFn: () => api.createVerification({
      incidentId: incident.id,
      requestedBy: role === "manager" ? "교대 관리자 박서진" : "라인 엔지니어 김현수",
      assignee,
      checks: checklist.filter((_, index) => checked[index]),
    }),
    onSuccess: (record) => setRecord(record),
  });
  const resetMutation = mutation.reset;

  const allChecked = useMemo(() => checked.every(Boolean), [checked]);
  const closeDialog = useCallback(() => {
    setChecked(checklist.map(() => false));
    setAssignee(defaultAssignee);
    resetMutation();
    setOpen(false);
  }, [resetMutation, setOpen]);

  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>("button")?.focus());

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDialog();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;

      if (event.shiftKey && (document.activeElement === first || document.activeElement === successHeadingRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
      previouslyFocusedRef.current?.focus();
    };
  }, [closeDialog, open]);

  useEffect(() => {
    if (open && mutation.isSuccess) successHeadingRef.current?.focus();
  }, [mutation.isSuccess, open]);

  if (!open) return null;

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) closeDialog();
    }}>
      <div
        className="verification-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="verification-title"
        aria-describedby={mutation.isSuccess ? "verification-result-summary" : "verification-description"}
        ref={dialogRef}
      >
        <header>
          <div><ShieldCheckIcon size={22} weight="duotone" /><span>현장 검증 작업 지시</span></div>
          <button type="button" onClick={closeDialog} aria-label="닫기"><XIcon size={19} /></button>
        </header>
        {mutation.isSuccess ? (
          <div className="verification-success" data-testid="verification-success" role="status" aria-live="polite">
            <CheckCircleIcon size={54} weight="duotone" />
            <h2 id="verification-title" ref={successHeadingRef} tabIndex={-1}>현장 검증 작업 지시를 발행했습니다</h2>
            <p id="verification-result-summary">작업 담당자와 완료 기한을 확인해 주세요.</p>
            <dl className="verification-result">
              <div><dt>작업 지시</dt><dd>{mutation.data.id}</dd></div>
              <div><dt>담당자</dt><dd>{mutation.data.assignee}</dd></div>
              <div><dt>상태</dt><dd>발행됨</dd></div>
              <div><dt>발행 시각</dt><dd>{formatDateTime(mutation.data.issuedAt)}</dd></div>
              <div><dt>완료 기한</dt><dd>{formatDateTime(mutation.data.dueAt)}</dd></div>
            </dl>
            <Button onClick={closeDialog}>진단 화면으로 돌아가기</Button>
          </div>
        ) : (
          <>
            <div className="dialog-intro">
              <ClipboardTextIcon size={28} weight="duotone" />
              <div>
                <h2 id="verification-title">{incident.equipmentId} 현장 검증</h2>
                <p id="verification-description">라인 가동 중에도 점검할 수 있습니다. 작업 지시를 발행하기 전에 담당자와 안전 조건을 확인해 주세요.</p>
              </div>
            </div>
            <div className="assignment-field">
              <label htmlFor="verification-assignee">작업 담당자</label>
              <select id="verification-assignee" value={assignee} onChange={(event) => setAssignee(event.target.value)}>
                {assignees.map((name) => <option value={name} key={name}>{name}</option>)}
              </select>
            </div>
            <fieldset>
              <legend>안전 조건</legend>
              {checklist.map((label, index) => (
                <label className="check-row" key={label}>
                  <input
                    type="checkbox"
                    checked={checked[index]}
                    onChange={(event) => setChecked((items) => items.map((item, itemIndex) => itemIndex === index ? event.target.checked : item))}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </fieldset>
            {mutation.isError ? <p className="form-error" role="alert">작업 지시를 발행하지 못했습니다. 잠시 후 다시 시도해 주세요.</p> : null}
            <footer>
              <Button variant="secondary" onClick={closeDialog}>취소</Button>
              <Button
                disabled={!allChecked || mutation.isPending}
                aria-busy={mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                {mutation.isPending ? "작업 지시 발행 중…" : "검증 작업 지시 발행"}
              </Button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
