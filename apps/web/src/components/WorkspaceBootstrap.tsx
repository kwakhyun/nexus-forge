import { useEffect } from "react";
import { diagnosticIncidents } from "@nexus/contracts";
import { usePlantSummary } from "../hooks/usePlantSummary";
import { asVerificationRecord } from "../domain/workspace";
import { useOperationsStore } from "../store/operationsStore";
import {
  listenForWorkspaceChanges,
  useWorkspaceStore,
} from "../store/workspaceStore";

/** One lifecycle owner; no sensor points or per-frame data are persisted. */
export function WorkspaceBootstrap() {
  const status = useWorkspaceStore((state) => state.status);
  const cases = useWorkspaceStore((state) => state.document.cases);
  const workOrders = useWorkspaceStore((state) => state.document.workOrders);
  const pendingVerification = useWorkspaceStore(
    (state) => state.document.pendingVerification,
  );
  const summary = usePlantSummary(status === "ready");
  const selectedEquipmentId = useOperationsStore((state) => state.selectedEquipmentId);
  useEffect(() => {
    void useWorkspaceStore.getState().load();
    return listenForWorkspaceChanges();
  }, []);
  useEffect(() => {
    if (status !== "ready" || !summary.data) return;
    const missing = diagnosticIncidents(summary.data).filter((incident) => !cases.some((item) => item.id === incident.id));
    // Older secondary scenarios first: the overview's primary incident remains first in the list.
    void (async () => {
      for (const incident of missing.reverse()) await useWorkspaceStore.getState().dispatch({ type: "seed", incident });
    })().catch(() => undefined);
  }, [cases, status, summary.data]);
  useEffect(() => {
    if (status !== "ready") return;
    const latest = workOrders.find((work) => !work.sample && work.equipmentId === selectedEquipmentId);
    const store = useOperationsStore.getState();
    store.setVerificationRecord(latest ? asVerificationRecord(latest) : null);
    store.setVerificationAttempt(pendingVerification);
  }, [pendingVerification, selectedEquipmentId, status, workOrders]);
  useEffect(() => {
    if (status !== "ready") return;
    const check = () =>
      void useWorkspaceStore
        .getState()
        .dispatch({ type: "check-overdue" })
        .catch(() => undefined);
    check();
    const timer = window.setInterval(check, 30_000);
    return () => window.clearInterval(timer);
  }, [status]);
  return null;
}
