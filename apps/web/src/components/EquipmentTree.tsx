import { useState } from "react";
import type { EquipmentStatus, PlantSummary } from "@nexus/contracts";
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
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

type StatusFilter = "all" | EquipmentStatus;

const statusLabel = {
  normal: "정상",
  warning: "경고",
  critical: "복합 이상",
  offline: "정지",
} as const;

export function EquipmentTree({ summary, selectedId, collapsed, onToggleCollapsed }: EquipmentTreeProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [plantExpanded, setPlantExpanded] = useState(true);
  const [expandedLines, setExpandedLines] = useState<Record<string, boolean>>({
    "coating-line-01": true,
    "coating-line-02": true,
  });
  const byId = new Map(summary.equipment.map((item) => [item.id, item]));
  const lineGroups = ["01", "02"].map((lineNumber) => ({
    id: `coating-line-${lineNumber}`,
    name: `코팅 ${Number(lineNumber)}호 라인`,
    equipmentIds: summary.equipment
      .filter((equipment) => equipment.id.endsWith(`-${lineNumber}`))
      .map((equipment) => equipment.id),
  }));
  const normalizedQuery = query.trim().toLocaleUpperCase("ko-KR");

  const matches = (equipmentId: string) => {
    const equipment = byId.get(equipmentId);
    if (!equipment) return false;
    const queryMatches = normalizedQuery.length === 0 || equipment.id.toLocaleUpperCase("ko-KR").includes(normalizedQuery);
    const statusMatches = statusFilter === "all" || equipment.status === statusFilter;
    return queryMatches && statusMatches;
  };

  if (collapsed) {
    return (
      <aside className="equipment-tree equipment-tree--collapsed" aria-label="접힌 설비 목록">
        <button type="button" className="tree-expand" onClick={onToggleCollapsed} aria-label="설비 목록 펼치기" title="설비 목록 펼치기">
          <SidebarSimpleIcon size={20} />
        </button>
      </aside>
    );
  }

  const visibleCount = lineGroups.reduce(
    (count, group) => count + group.equipmentIds.filter(matches).length,
    0,
  );

  return (
    <aside className="equipment-tree" aria-label="설비 목록">
      <div className="equipment-search">
        <MagnifyingGlassIcon size={17} aria-hidden="true" />
        <input
          aria-label="설비 검색"
          placeholder="설비 ID 검색"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button
          type="button"
          aria-label="설비 상태 필터"
          aria-expanded={filterOpen}
          aria-controls="equipment-filter-panel"
          className={statusFilter === "all" ? "" : "active"}
          onClick={() => setFilterOpen((value) => !value)}
        >
          <FunnelIcon size={16} weight={statusFilter === "all" ? "regular" : "fill"} />
        </button>
      </div>
      {filterOpen ? (
        <div className="equipment-filter-panel" id="equipment-filter-panel">
          <label htmlFor="equipment-status-filter">설비 상태</label>
          <select
            id="equipment-status-filter"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          >
            <option value="all">전체</option>
            <option value="critical">이상</option>
            <option value="warning">경고</option>
            <option value="normal">정상</option>
            <option value="offline">정지</option>
          </select>
        </div>
      ) : null}
      <button
        type="button"
        className="tree-branch root"
        aria-expanded={plantExpanded}
        onClick={() => setPlantExpanded((value) => !value)}
      >
        {plantExpanded ? <CaretDownIcon size={13} /> : <CaretRightIcon size={13} />}
        <FactoryIcon size={17} weight="duotone" />
        <span>{summary.plantName}</span>
      </button>
      {plantExpanded ? lineGroups.map((group) => {
        const visibleIds = group.equipmentIds.filter(matches);
        if (visibleIds.length === 0 && (normalizedQuery || statusFilter !== "all")) return null;
        const expanded = expandedLines[group.id] ?? false;

        return (
          <div className="equipment-group" key={group.id}>
            <button
              type="button"
              className="tree-branch"
              aria-expanded={expanded}
              onClick={() => setExpandedLines((lines) => ({ ...lines, [group.id]: !expanded }))}
            >
              {expanded ? <CaretDownIcon size={13} /> : <CaretRightIcon size={13} />}
              <HardDrivesIcon size={16} weight="duotone" />
              <span>{group.name}</span>
            </button>
            {expanded ? (
              <div className="tree-items">
                {visibleIds.map((id) => {
                  const item = byId.get(id);
                  if (!item) return null;
                  return (
                    <div
                      className={`tree-item ${id === selectedId ? "selected" : ""}`}
                      key={id}
                      aria-current={id === selectedId ? "true" : undefined}
                    >
                      <HardDrivesIcon size={15} weight={id === selectedId ? "fill" : "regular"} />
                      <span>{id}</span>
                      <StatusBadge compact tone={item.status}>{statusLabel[item.status]}</StatusBadge>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      }) : null}
      {visibleCount === 0 ? <p className="tree-empty">조건에 맞는 설비가 없습니다.</p> : null}
      <button type="button" className="tree-collapse" onClick={onToggleCollapsed}>
        <SidebarSimpleIcon size={17} />
        설비 목록 접기
      </button>
    </aside>
  );
}
