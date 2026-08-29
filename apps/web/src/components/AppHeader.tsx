import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  CaretDownIcon,
  FactoryIcon,
  PulseIcon,
  SquaresFourIcon,
  UserCircleIcon,
} from "@phosphor-icons/react";
import { StatusBadge } from "@nexus/ui";
import { formatDateTime } from "../lib/format";
import { useOperationsStore } from "../store/operationsStore";

const applicationBootTime = Date.now();

export function AppHeader() {
  const [now, setNow] = useState(applicationBootTime);
  const connection = useOperationsStore((state) => state.connection);
  const role = useOperationsStore((state) => state.role);
  const setRole = useOperationsStore((state) => state.setRole);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const streamLabel = {
    connecting: "데이터 연결 중",
    live: "데이터 수신 정상",
    reconnecting: "데이터 재연결 중",
    offline: "데이터 연결 끊김",
  }[connection];

  const streamTone = connection === "live" ? "normal" : connection === "offline" ? "critical" : "warning";

  return (
    <header className="app-header">
      <NavLink to="/overview" className="brand" aria-label="NEXUS Forge 공정 개요">
        NEXUS <span>Forge</span>
      </NavLink>
      <span className="header-divider" aria-hidden="true" />
      <div className="header-context">
        <FactoryIcon size={18} weight="duotone" />
        배터리 1공장
      </div>
      <div className="header-context">
        코팅 2호 라인
      </div>
      <div className="header-status" role="status" aria-live="polite" aria-atomic="true">
        <StatusBadge tone={streamTone}>{streamLabel}</StatusBadge>
      </div>
      <nav className="header-nav" aria-label="주요 화면">
        <NavLink to="/diagnostics/COATER-02" className={({ isActive }) => isActive ? "active" : ""}>
          <PulseIcon size={19} weight="duotone" />
          <span>신호 분석</span>
        </NavLink>
        <NavLink to="/overview" className={({ isActive }) => isActive ? "active" : ""}>
          <SquaresFourIcon size={18} weight="duotone" />
          <span>전체 공정</span>
        </NavLink>
      </nav>
      <div className="header-spacer" />
      <label className="role-select">
        <UserCircleIcon size={19} />
        <span className="sr-only">사용자 역할</span>
        <select value={role} onChange={(event) => setRole(event.target.value as "operator" | "manager") }>
          <option value="operator">라인 엔지니어</option>
          <option value="manager">교대 관리자</option>
        </select>
        <CaretDownIcon size={14} aria-hidden="true" />
      </label>
      <time className="header-time" dateTime={new Date(now).toISOString()}>{formatDateTime(now)}</time>
    </header>
  );
}
