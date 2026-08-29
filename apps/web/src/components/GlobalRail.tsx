import {
  BellIcon,
  ChartLineUpIcon,
  GearIcon,
  ShieldWarningIcon,
  SquaresFourIcon,
  WrenchIcon,
} from "@phosphor-icons/react";

const items = [
  { label: "공정 개요", icon: SquaresFourIcon, active: true },
  { label: "생산 분석", icon: ChartLineUpIcon },
  { label: "이상 관리", icon: ShieldWarningIcon },
  { label: "정비 관리", icon: WrenchIcon },
  { label: "알림", icon: BellIcon },
  { label: "설정", icon: GearIcon },
];

export function GlobalRail() {
  return (
    <aside className="global-rail" aria-label="제품 탐색">
      {items.map(({ label, icon: Icon, active }) => (
        <button type="button" className={active ? "active" : ""} key={label} aria-label={label} title={label}>
          <Icon size={21} weight={active ? "fill" : "regular"} />
          <span>{label}</span>
        </button>
      ))}
    </aside>
  );
}
