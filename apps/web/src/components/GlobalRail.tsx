import { NavLink } from "react-router-dom";
import {
  BellIcon,
  ChartLineUpIcon,
  GearIcon,
  ShieldWarningIcon,
  SquaresFourIcon,
  WrenchIcon,
} from "@phosphor-icons/react";
import { useWorkspaceStore } from "../store/workspaceStore";

const items = [
  { label: "공정 개요", icon: SquaresFourIcon, href: "/overview" },
  { label: "생산 분석", icon: ChartLineUpIcon, href: "/production" },
  { label: "이상 관리", icon: ShieldWarningIcon, href: "/incidents" },
  { label: "정비 관리", icon: WrenchIcon, href: "/maintenance" },
  { label: "알림", icon: BellIcon, href: "/notifications" },
  { label: "설정", icon: GearIcon, href: "/settings" },
] as const;

export function GlobalRail() {
  const unread = useWorkspaceStore(
    (state) =>
      state.document.notifications.filter((item) => item.readAt === null)
        .length,
  );
  return (
    <nav className="global-rail" aria-label="제품 탐색">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            to={item.href}
            className={({ isActive }) => (isActive ? "active" : "")}
            key={item.label}
            aria-label={item.label}
            title={item.label}
            aria-describedby={
              item.href === "/notifications" && unread > 0
                ? "navigation-unread-description"
                : undefined
            }
          >
            <Icon size={21} weight="duotone" aria-hidden="true" />
            <span>{item.label}</span>
            {item.href === "/notifications" && unread > 0 ? (
              <>
                <span className="nav-count" aria-hidden="true">
                  {unread > 99 ? "99+" : unread}
                </span>
                <span className="sr-only" id="navigation-unread-description">
                  읽지 않은 알림 {unread}건
                </span>
              </>
            ) : null}
          </NavLink>
        );
      })}
    </nav>
  );
}
