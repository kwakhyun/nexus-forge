import type { Meta, StoryObj } from "@storybook/react-vite";
import { PulseIcon } from "@phosphor-icons/react";
import { Button, KpiValue, StatusBadge } from "@nexus/ui";

function ComponentGallery() {
  return (
    <div style={{ display: "grid", gap: 24, minWidth: 540, padding: 32, background: "var(--nf-bg-1)", color: "var(--nf-text-1)" }}>
      <div style={{ display: "flex", gap: 10 }}>
        <StatusBadge tone="normal">스트림 정상</StatusBadge>
        <StatusBadge tone="warning">경고</StatusBadge>
        <StatusBadge tone="critical">복합 이상</StatusBadge>
        <StatusBadge tone="offline">정지</StatusBadge>
      </div>
      <div style={{ display: "flex", gap: 32 }}>
        <KpiValue label="웹 장력" value="148" unit="N" tone="critical" />
        <KpiValue label="스트림 지연" value="0.3" unit="초" tone="accent" />
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        <Button icon={<PulseIcon size={18} />}>신호 진단 열기</Button>
        <Button variant="secondary">취소</Button>
        <Button disabled>요청 중</Button>
      </div>
    </div>
  );
}

const meta = {
  title: "NEXUS Forge/Operations Primitives",
  component: ComponentGallery,
} satisfies Meta<typeof ComponentGallery>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
