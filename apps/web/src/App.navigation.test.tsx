import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Link, MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { AppHeader } from "./components/AppHeader";
import { useOperationsStore } from "./store/operationsStore";
import { useSensorStream } from "./hooks/useSensorStream";

vi.mock("./hooks/useSensorStream", () => ({ useSensorStream: vi.fn() }));
vi.mock("./components/WorkspaceBootstrap", () => ({ WorkspaceBootstrap: () => null }));
vi.mock("./routes/DiagnosticsPage", () => ({ DiagnosticsPage: () => <div>진단</div> }));
vi.mock("./routes/MaintenancePage", () => ({ MaintenancePage: () => <div>정비 화면</div> }));
vi.mock("./routes/OverviewPage", () => ({ OverviewPage: () => <div>개요 화면</div> }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("retains the last diagnostic equipment through maintenance and overview while scoping subscriptions", async () => {
  useOperationsStore.setState({ lastDiagnosticEquipmentId: "COATER-02" });
  render(<MemoryRouter initialEntries={["/diagnostics/DRYER-02"]}>
    <AppHeader /><Link to="/maintenance">정비로 이동</Link><Link to="/overview">개요로 이동</Link><App />
  </MemoryRouter>);
  await screen.findByText("진단");
  expect(screen.getByRole("link", { name: "신호 분석" })).toHaveAttribute("href", "/diagnostics/DRYER-02");
  fireEvent.click(screen.getByText("정비로 이동"));
  await screen.findByText("정비 화면");
  expect(useSensorStream).toHaveBeenLastCalledWith(false, "COATER-02");
  expect(screen.getByRole("link", { name: "신호 분석" })).toHaveAttribute("href", "/diagnostics/DRYER-02");
  fireEvent.click(screen.getByText("개요로 이동"));
  await screen.findByText("개요 화면");
  expect(useSensorStream).toHaveBeenLastCalledWith(true, "COATER-02");
  expect(screen.getByRole("link", { name: "신호 분석" })).toHaveAttribute("href", "/diagnostics/DRYER-02");
});
