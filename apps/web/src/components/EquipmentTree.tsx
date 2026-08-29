import type { PlantSummary } from "@nexus/contracts";
import {
  CaretDownIcon,
  CaretRightIcon,
  FactoryIcon,
  FunnelIcon,
  HardDrivesIcon,
  MagnifyingGlassIcon,
  SidebarSimpleIcon,
} from "@phosphor-icons/react";
import { StatusBadge } from "@nexus/ui";

interface EquipmentTreeProps {
  summary: PlantSummary;
  selectedId: string;
}

const lineOne = ["UNW-01", "MIX-01", "COATER-01", "DRYER-01", "CAL-01", "REW-01"];
const lineTwo = ["UNW-02", "MIX-02", "COATER-02", "DRYER-02", "CAL-02", "REW-02"];

export function EquipmentTree({ summary, selectedId }: EquipmentTreeProps) {
  const byId = new Map(summary.equipment.map((item) => [item.id, item]));

  const renderLine = (name: string, ids: string[]) => (
    <div className="equipment-group">
      <button type="button" className="tree-branch">
        <CaretDownIcon size={13} />
        <HardDrivesIcon size={16} weight="duotone" />
        <span>{name}</span>
      </button>
      <div className="tree-items">
        {ids.map((id) => {
          const item = byId.get(id);
          if (!item) return null;
          return (
            <button
              type="button"
              className={`tree-item ${id === selectedId ? "selected" : ""}`}
              key={id}
              aria-current={id === selectedId ? "true" : undefined}
            >
              <HardDrivesIcon size={15} weight={id === selectedId ? "fill" : "regular"} />
              <span>{id}</span>
              <StatusBadge compact tone={item.status}>
                {item.status === "critical" ? "복합 이상" : item.status === "warning" ? "경고" : "정상"}
              </StatusBadge>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <aside className="equipment-tree" aria-label="설비 트리">
      <div className="equipment-search">
        <MagnifyingGlassIcon size={17} />
        <input aria-label="장비 검색" placeholder="장비 검색" />
        <button type="button" aria-label="장비 필터"><FunnelIcon size={16} /></button>
      </div>
      <button type="button" className="tree-branch root">
        <CaretDownIcon size={13} />
        <FactoryIcon size={17} weight="duotone" />
        <span>{summary.plantName}</span>
      </button>
      {renderLine("코팅 라인 1", lineOne)}
      {renderLine("코팅 라인 2", lineTwo)}
      <button type="button" className="tree-branch collapsed">
        <CaretRightIcon size={13} />
        <HardDrivesIcon size={16} weight="duotone" />
        <span>Calendaring 라인 1</span>
      </button>
      <button type="button" className="tree-branch collapsed">
        <CaretRightIcon size={13} />
        <HardDrivesIcon size={16} weight="duotone" />
        <span>Slitting 라인 1</span>
      </button>
      <button type="button" className="tree-collapse">
        <SidebarSimpleIcon size={17} />
        설비 트리 접기
      </button>
    </aside>
  );
}
