import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation, matchPath } from "react-router-dom";
import { SELECTED_EQUIPMENT_ID, isDiagnosticEquipmentId } from "@nexus/contracts";
import { OverviewPage } from "./routes/OverviewPage";
import { useSensorStream } from "./hooks/useSensorStream";
import { RouteFeedback } from "./components/RouteFeedback";
import { ScreenErrorBoundary } from "./components/ScreenErrorBoundary";
import { WorkspaceBootstrap } from "./components/WorkspaceBootstrap";

const DiagnosticsPage = lazy(async () => {
  const module = await import("./routes/DiagnosticsPage");
  return { default: module.DiagnosticsPage };
});
const ProductionPage = lazy(() =>
  import("./routes/ProductionPage").then((module) => ({
    default: module.ProductionPage,
  })),
);
const IncidentsPage = lazy(() =>
  import("./routes/IncidentsPage").then((module) => ({
    default: module.IncidentsPage,
  })),
);
const MaintenancePage = lazy(() =>
  import("./routes/MaintenancePage").then((module) => ({
    default: module.MaintenancePage,
  })),
);
const NotificationsPage = lazy(() =>
  import("./routes/NotificationsPage").then((module) => ({
    default: module.NotificationsPage,
  })),
);
const SettingsPage = lazy(() =>
  import("./routes/SettingsPage").then((module) => ({
    default: module.SettingsPage,
  })),
);

export function App() {
  const { pathname } = useLocation();
  const routeEquipment = matchPath("/diagnostics/:equipmentId", pathname)?.params.equipmentId;
  useSensorStream(true, isDiagnosticEquipmentId(routeEquipment) ? routeEquipment : SELECTED_EQUIPMENT_ID);

  return (
    <>
      <WorkspaceBootstrap />
      <ScreenErrorBoundary key={pathname}>
        <Suspense
          fallback={
            <RouteFeedback loading title="운영 화면을 준비하는 중입니다…" />
          }
        >
          <Routes>
            <Route path="/" element={<Navigate to="/overview" replace />} />
            <Route path="/overview" element={<OverviewPage />} />
            <Route
              path="/diagnostics/:equipmentId"
              element={
                <Suspense
                  fallback={
                    <RouteFeedback
                      loading
                      title="신호 분석 화면을 준비하는 중입니다…"
                    />
                  }
                >
                  <DiagnosticsPage key={pathname} />
                </Suspense>
              }
            />
            <Route path="/production" element={<ProductionPage />} />
            <Route path="/incidents" element={<IncidentsPage />} />
            <Route path="/maintenance" element={<MaintenancePage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/overview" replace />} />
          </Routes>
        </Suspense>
      </ScreenErrorBoundary>
    </>
  );
}
