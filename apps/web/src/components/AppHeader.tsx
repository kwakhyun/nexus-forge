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
    connecting: "연결 중",
    live: "스트림 정상",
    reconnecting: "재연결 중",
    offline: "스트림 오프라인",
  }[connection];

  const streamTone = connection === "live" ? "normal" : connection === "offline" ? "critical" : "warning";

  return (
    <header className="app-header">
      <NavLink to="/overview" className="brand" aria-label="NEXUS Forge 공정 개요">
        NEXUS <span>Forge</span>
      </NavLink>
      <span className="header-divider" aria-hidden="true" />
      <button className="header-context" type="button">
        <FactoryIcon size={18} weight="duotone" />
        배터리 1공장
        <CaretDownIcon size={14} />
      </button>
      <button className="header-context" type="button">
        코팅 라인 2
        <CaretDownIcon size={14} />
      </button>
      <div className="header-status">
        <StatusBadge tone={streamTone}>{streamLabel}</StatusBadge>
      </div>
      <nav className="header-nav" aria-label="주요 화면">
        <NavLink to="/diagnostics/COATER-02" className={({ isActive }) => isActive ? "active" : ""}>
          <PulseIcon size={19} weight="duotone" />
          신호 분석
        </NavLink>
        <NavLink to="/overview" className={({ isActive }) => isActive ? "active" : ""}>
          <SquaresFourIcon size={18} weight="duotone" />
          공정 전체 보기
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
