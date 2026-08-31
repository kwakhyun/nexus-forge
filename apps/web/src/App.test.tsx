import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "./App";

vi.mock("./hooks/useSensorStream", () => ({ useSensorStream: vi.fn() }));
vi.mock("./components/WorkspaceBootstrap", () => ({ WorkspaceBootstrap: () => null }));
vi.mock("./routes/OverviewPage", () => ({
  OverviewPage: () => { throw new Error("render-failure"); },
}));
vi.mock("./routes/DiagnosticsPage", () => ({
  DiagnosticsPage: () => <h1>복구된 신호 분석 화면</h1>,
}));

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("allows navigation to another screen after a route render failure", async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  render(<MemoryRouter initialEntries={["/overview"]}><App /></MemoryRouter>);
  expect(screen.getByRole("heading", { name: "화면을 표시하는 중 문제가 발생했습니다." })).toBeInTheDocument();
  expect(screen.getByText(/브라우저에 저장한 작업 기록은 유지/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("link", { name: "신호 분석" }));
  expect(await screen.findByRole("heading", { name: "복구된 신호 분석 화면" })).toBeInTheDocument();
});
