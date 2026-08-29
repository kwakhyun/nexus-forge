import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ProcessStage } from "@nexus/contracts";
import { ProcessStrip } from "./ProcessStrip";

const stages: ProcessStage[] = [
  { id: "mixing", name: "믹싱", status: "normal", equipmentCount: 2 },
  { id: "coating", name: "코팅", status: "critical", equipmentCount: 3 },
  { id: "pressing", name: "롤 프레싱", status: "normal", equipmentCount: 2 },
  { id: "slitting", name: "슬리팅", status: "normal", equipmentCount: 2 },
];

const meta = {
  title: "NEXUS Forge/Process Strip",
  component: ProcessStrip,
  parameters: { layout: "fullscreen" },
  args: { stages },
} satisfies Meta<typeof ProcessStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CriticalCoating: Story = {};
