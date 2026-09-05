import type { Meta, StoryObj } from "@storybook/react-vite";
import { PulseIcon } from "@phosphor-icons/react";
import { Button, KpiValue, StatusBadge } from "@nexus/ui";

function ComponentGallery() {
  return (
    <div style={{ display: "grid", gap: 24, minWidth: 540, padding: 32, background: "var(--nf-bg-1)", color: "var(--nf-text-1)" }}>
      <div style={{ display: "flex", gap: 10 }}>
        <StatusBadge tone="normal">데이터 수신 정상</StatusBadge>
        <StatusBadge tone="warning">경고</StatusBadge>
        <StatusBadge tone="critical">복합 이상</StatusBadge>
        <StatusBadge tone="offline">정지</StatusBadge>
      </div>
      <div style={{ display: "flex", gap: 32 }}>
        <KpiValue label="웹 장력" value="148" unit="N" tone="critical" />
        <KpiValue label="데이터 지연" value="0.3" unit="초" tone="accent" />
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        <Button icon={<PulseIcon size={18} />}>신호 진단 열기</Button>
        <Button variant="secondary">취소</Button>
        <Button disabled>요청 처리 중</Button>
      </div>
      <section style={{ display: "grid", gap: 16, padding: 20, background: "#f7f9fc", color: "#284051" }} aria-label="밝은 업무 화면">
        <div style={{ display: "flex", gap: 10 }}>
          <StatusBadge appearance="pill" tone="neutral">미확인</StatusBadge>
          <StatusBadge appearance="pill" tone="accent">조치 중</StatusBadge>
          <StatusBadge appearance="pill" tone="normal">완료</StatusBadge>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <Button theme="light">변경 저장</Button>
          <Button theme="light" variant="secondary">취소</Button>
          <Button theme="light" variant="danger">기록 초기화</Button>
          <Button theme="light" disabled>저장 중</Button>
        </div>
      </section>
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
