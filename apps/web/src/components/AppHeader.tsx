import { StatusBadge } from "@nexus/ui";
import {
  CaretDownIcon,
  FactoryIcon,
  PulseIcon,
  SquaresFourIcon,
  UserCircleIcon,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { useTimeFormat } from "../hooks/useTimeFormat";
import { useOperationsStore } from "../store/operationsStore";
import { useWorkspaceStore } from "../store/workspaceStore";

const applicationBootTime = Date.now();

export function AppHeader() {
  const { formatDateTime, zoneLabel } = useTimeFormat();
  const storageError = useWorkspaceStore((state) => state.error);
  const [now, setNow] = useState(applicationBootTime);
  const connection = useOperationsStore((state) => state.connection);
  const role = useOperationsStore((state) => state.role);
  const selectedEquipmentId = useOperationsStore((state) => state.lastDiagnosticEquipmentId);
  const setRole = useOperationsStore((state) => state.setRole);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const streamLabel = {
    paused: "실시간 수신 대기",
    connecting: "데이터 연결 중",
    live: "데이터 수신 정상",
    stale: "센서 데이터 지연",
    reconnecting: "데이터 재연결 중",
    offline: "데이터 연결 끊김",
  }[connection];

  const streamTone = connection === "live"
    ? "normal"
    : connection === "offline" || connection === "stale"
      ? "critical"
      : connection === "paused" ? "info" : "warning";

  return (
    <header className="app-header">
      <a className="skip-link" href="#main-content">본문으로 건너뛰기</a>
      <NavLink to="/overview" className="brand" aria-label="NEXUS Forge 공정 개요">
        NEXUS <span>Forge</span>
      </NavLink>
      <div className="header-context" aria-label="모니터링 대상">
        <FactoryIcon size={18} weight="duotone" aria-hidden="true" />
        <span>배터리 1공장<small>코팅 2호 라인</small></span>
      </div>
      <div className="header-status" role="status" aria-live="polite" aria-atomic="true">
        <StatusBadge tone={streamTone}>{streamLabel}</StatusBadge>
      </div>
      <nav className="header-nav" aria-label="주요 화면">
        <NavLink to={`/diagnostics/${selectedEquipmentId}`} className={({ isActive }) => isActive ? "active" : ""}>
          <PulseIcon size={19} weight="duotone" aria-hidden="true" />
          <span>신호 분석</span>
        </NavLink>
        <NavLink to="/overview" className={({ isActive }) => isActive ? "active" : ""}>
          <SquaresFourIcon size={18} weight="duotone" aria-hidden="true" />
          <span>전체 공정</span>
        </NavLink>
      </nav>
      <div className="header-spacer" />
      <label className="role-select">
        <UserCircleIcon size={19} aria-hidden="true" />
        <span className="sr-only">사용자 역할</span>
        <select value={role} aria-describedby="demo-disclaimer" onChange={(event) => setRole(event.target.value as "operator" | "manager") }>
          <option value="operator">라인 엔지니어</option>
          <option value="manager">교대 관리자</option>
        </select>
        <CaretDownIcon size={14} aria-hidden="true" />
      </label>
      <time className="header-time" dateTime={new Date(now).toISOString()}>{formatDateTime(now)} {zoneLabel}</time>
      <div className="demo-notice" id="demo-disclaimer"><strong>공개 데모</strong><span>가상 데이터와 역할 체험이며, 실제 설비를 제어하지 않습니다.</span>{storageError ? <span className="header-storage-error" role="alert">기록 저장소에 연결하지 못했습니다. <NavLink to="/settings">복구 설정</NavLink></span> : null}</div>
    </header>
  );
}
