import { useEffect, useMemo, useRef, useState } from "react";
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
import { useOperationsStore } from "../store/operationsStore";

interface VerificationDialogProps {
  incident: Incident;
}

const checklist = [
  "댄서 롤 가드와 접근 동선을 확인했습니다.",
  "라인 속도 76 m/min 유지 조건을 확인했습니다.",
  "현장 작업자에게 점검 목적을 공유했습니다.",
];

export function VerificationDialog({ incident }: VerificationDialogProps) {
  const open = useOperationsStore((state) => state.verificationOpen);
  const setOpen = useOperationsStore((state) => state.setVerificationOpen);
  const setRecord = useOperationsStore((state) => state.setVerificationRecord);
  const role = useOperationsStore((state) => state.role);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [checked, setChecked] = useState<boolean[]>(() => checklist.map(() => false));

  const mutation = useMutation({
    mutationFn: () => api.createVerification({
      incidentId: incident.id,
      requestedBy: role === "manager" ? "교대 관리자 박서진" : "라인 엔지니어 김현수",
      checks: checklist.filter((_, index) => checked[index]),
    }),
    onSuccess: (record) => setRecord(record),
  });

  const allChecked = useMemo(() => checked.every(Boolean), [checked]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>("button")?.focus());
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) setOpen(false);
    }}>
      <div className="verification-dialog" role="dialog" aria-modal="true" aria-labelledby="verification-title" ref={dialogRef}>
        <header>
          <div><ShieldCheckIcon size={22} weight="duotone" /><span>안전 검증 절차</span></div>
          <button type="button" onClick={() => setOpen(false)} aria-label="닫기"><XIcon size={19} /></button>
        </header>
        {mutation.isSuccess ? (
          <div className="verification-success" data-testid="verification-success">
            <CheckCircleIcon size={54} weight="duotone" />
            <h2 id="verification-title">현장 확인 요청이 발행되었습니다</h2>
            <p>작업 지시 <strong>{mutation.data.id}</strong>가 담당자에게 전달되었습니다.</p>
            <Button onClick={() => setOpen(false)}>진단 화면으로 돌아가기</Button>
          </div>
        ) : (
          <>
            <div className="dialog-intro">
              <ClipboardTextIcon size={28} weight="duotone" />
              <div>
                <h2 id="verification-title">{incident.equipmentId} 원인 검증</h2>
                <p>가동 중 점검이 가능한 항목입니다. 현장 요청 전에 안전 조건을 확인하세요.</p>
              </div>
            </div>
            <fieldset>
              <legend>사전 확인</legend>
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
            {mutation.isError ? <p className="form-error">요청을 발행하지 못했습니다. 스트림 서버 연결을 확인해 주세요.</p> : null}
            <footer>
              <Button variant="secondary" onClick={() => setOpen(false)}>취소</Button>
              <Button disabled={!allChecked || mutation.isPending} onClick={() => mutation.mutate()}>
                {mutation.isPending ? "발행 중…" : "현장 확인 요청"}
              </Button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
