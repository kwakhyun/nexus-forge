import { NavLink } from "react-router-dom";
import {
  BellIcon,
  ChartLineUpIcon,
  GearIcon,
  ShieldWarningIcon,
  SquaresFourIcon,
  WrenchIcon,
} from "@phosphor-icons/react";

const items = [
  { label: "공정 개요", icon: SquaresFourIcon, href: "/overview" },
  { label: "생산 분석", icon: ChartLineUpIcon },
  { label: "이상 관리", icon: ShieldWarningIcon },
  { label: "정비 관리", icon: WrenchIcon },
  { label: "알림", icon: BellIcon },
  { label: "설정", icon: GearIcon },
] as const;

export function GlobalRail() {
  return (
    <aside className="global-rail" aria-label="제품 탐색">
      {items.map((item) => {
        const Icon = item.icon;
        return "href" in item ? (
          <NavLink to={item.href} className={({ isActive }) => isActive ? "active" : ""} key={item.label} aria-label={item.label} title={item.label}>
            <Icon size={21} weight="fill" />
            <span>{item.label}</span>
          </NavLink>
        ) : (
          <span className="global-rail__item is-disabled" key={item.label} title={`${item.label} · 준비 중`}>
            <Icon size={21} weight="regular" />
            <span>{item.label}<span className="sr-only">, 준비 중</span></span>
          </span>
        );
      })}
    </aside>
  );
}
