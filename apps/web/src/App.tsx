import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { OverviewPage } from "./routes/OverviewPage";
import { useSensorStream } from "./hooks/useSensorStream";

const DiagnosticsPage = lazy(async () => {
  const module = await import("./routes/DiagnosticsPage");
  return { default: module.DiagnosticsPage };
});

export function App() {
  useSensorStream(true);

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/overview" replace />} />
      <Route path="/overview" element={<OverviewPage />} />
      <Route
        path="/diagnostics/:equipmentId"
        element={(
          <Suspense fallback={<div className="route-loading">진단 도구를 준비하는 중입니다…</div>}>
            <DiagnosticsPage />
          </Suspense>
        )}
      />
      <Route path="*" element={<Navigate to="/overview" replace />} />
    </Routes>
  );
}
