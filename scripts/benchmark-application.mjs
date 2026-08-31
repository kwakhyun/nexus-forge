import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { cpus, platform, release, tmpdir } from "node:os";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { chromium, expect } from "@playwright/test";
import { createOperationsHandler, attachOperationsStream } from "../apps/stream-server/dist/runtime.js";

// This serves the real production-built app, HTTP handlers and WebSocket runtime.
// It is a loopback experiment, not a substitute for deployment/RUM measurements.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Resolve from the app, not the repo root where Storybook can hoist another Vite major.
const webRequire = createRequire(join(root, "apps/web/package.json"));
const { build } = await import(pathToFileURL(webRequire.resolve("vite")).href);
const dependencyVersions = Object.fromEntries(["vite", "react", "echarts", "@playwright/test"].map((name) => [name, webRequire(`${name}/package.json`).version]));
const options = { runs: 3, seconds: 30, soakSeconds: 180, output: null };
const argumentsList = process.argv.slice(2);
for (let index = 0; index < argumentsList.length; index += 2) {
  const key = { "--runs": "runs", "--seconds": "seconds", "--soak-seconds": "soakSeconds", "--output": "output" }[argumentsList[index]];
  const value = argumentsList[index + 1];
  if (!key || value === undefined) throw new Error("Usage: --runs N --seconds N --soak-seconds N --output FILE");
  options[key] = key === "output" ? resolve(value) : Number(value);
}
if (!Number.isInteger(options.runs) || options.runs < 1 || options.runs > 10 ||
  !Number.isFinite(options.seconds) || options.seconds < 5 || options.seconds > 180 ||
  !Number.isFinite(options.soakSeconds) || options.soakSeconds < 0 || options.soakSeconds > 180) {
  throw new Error("runs must be 1–10, seconds 5–180, soak-seconds 0–180 (bounded probe buffers).");
}
const temporaryDirectory = await mkdtemp(join(tmpdir(), "nexus-application-benchmark-"));
const buildDirectory = join(temporaryDirectory, "client");
const outputPath = options.output ?? join(temporaryDirectory, "application-flow.json");
const sourcePaths = [
  "apps/web/src/main.tsx", "apps/web/src/App.tsx", "apps/web/src/styles.css",
  "apps/web/src/api/client.ts", "apps/web/src/api/validation.ts",
  "apps/web/src/hooks/useSensorStream.ts", "apps/web/src/lib/downsample.ts",
  "apps/web/src/lib/signalChart.ts", "apps/web/src/domain/diagnosticProfiles.ts",
  "apps/web/src/domain/workspace.ts", "apps/web/src/store/operationsStore.ts",
  "apps/web/src/store/workspaceStore.ts", "apps/web/src/lib/workspaceDatabase.ts",
  "apps/web/src/routes/OverviewPage.tsx", "apps/web/src/routes/DiagnosticsPage.tsx", "apps/web/src/components/SignalWorkbench.tsx",
  "apps/web/src/components/WorkspaceBootstrap.tsx",
  "apps/web/src/components/VerificationDialog.tsx", "apps/web/src/observability/performanceProbe.ts",
  "apps/stream-server/src/runtime.ts", "apps/stream-server/src/simulation.ts",
  "packages/contracts/src/index.ts", "scripts/benchmark-application.mjs", "package-lock.json",
];
const hashes = Object.fromEntries(await Promise.all(sourcePaths.map(async (path) =>
  [path, createHash("sha256").update(await readFile(join(root, path))).digest("hex")])));
const round = (number) => Math.round(number * 1000) / 1000;
function distribution(values) {
  if (!values.length) return { samples: 0, medianMs: null, p95Ms: null, minMs: null, maxMs: null };
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return {
    samples: sorted.length,
    medianMs: round(sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2),
    // With very small N, a "p95" is just the maximum. Keep this visibly unavailable.
    p95Ms: sorted.length >= 20 ? round(sorted[Math.ceil(sorted.length * 0.95) - 1]) : null,
    minMs: round(sorted[0]), maxMs: round(sorted.at(-1)),
  };
}
function summarize(measurements) {
  return Object.fromEntries([...new Set(measurements.map((item) => item.name))].sort().map((name) =>
    [name, distribution(measurements.filter((item) => item.name === name).map((item) => item.durationMs))]));
}
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2", ".json": "application/json" };
const api = createOperationsHandler();
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
    if (pathname.startsWith("/api/") || pathname === "/health") return await api(request, response);
    const path = resolve(buildDirectory, `.${pathname}`);
    if (path !== buildDirectory && !path.startsWith(`${buildDirectory}${sep}`)) {
      response.writeHead(403); response.end(); return;
    }
    const file = extname(path) ? path : join(buildDirectory, "index.html");
    const bytes = await readFile(file);
    response.writeHead(200, { "Content-Type": mime[extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" });
    response.end(bytes);
  } catch {
    response.writeHead(404); response.end();
  }
});
let stream;
let browser;
const results = [];
try {
  console.log("Building the actual app with an opt-in local performance probe…");
  await build({
    root: join(root, "apps/web"), configFile: join(root, "apps/web/vite.config.ts"), logLevel: "warn",
    define: { "import.meta.env.VITE_PERFORMANCE_PROBE": JSON.stringify("true"), "import.meta.env.VITE_SENTRY_DSN": JSON.stringify("") },
    build: { outDir: buildDirectory, emptyOutDir: true },
  });
  stream = attachOperationsStream(server);
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
  const browserVersion = browser.version();

  async function measureRun(equipmentId, runNumber, seconds, soak = false) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1024 }, deviceScaleFactor: 1, locale: "ko-KR", timezoneId: "Asia/Seoul" });
    const page = await context.newPage();
    const errors = [];
    const network = { requests: 0, responses: 0, failed: [], httpErrors: [] };
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("request", () => { network.requests += 1; });
    page.on("response", (response) => {
      network.responses += 1;
      if (response.status() >= 400) network.httpErrors.push({ path: new URL(response.url()).pathname, status: response.status() });
    });
    page.on("requestfailed", (request) => network.failed.push({ path: new URL(request.url()).pathname, error: request.failure()?.errorText }));
    try {
      console.log(`${soak ? "Soak" : "Run"} ${runNumber}: ${equipmentId}, ${seconds}s observation`);
      await page.goto(`${baseUrl}/overview`);
      await page.getByRole("button", { name: `${equipmentId} 이상 신호 진단 열기`, exact: true }).click();
      await page.waitForFunction(() => window.__nexusPerformance?.snapshot().measurements.some((item) => item.name === "history_request_to_frame_opportunity"));
      await page.waitForFunction(() => window.__nexusPerformance?.snapshot().measurements.some((item) => item.name === "equipment_click_to_history_frame_opportunity"));
      await expect(page.getByRole("button", { name: "현장 검증 시작", exact: true })).toBeEnabled();
      await page.waitForFunction(() => window.__nexusPerformance?.snapshot().measurements.filter((item) => item.name === "stream_latest_receive_to_frame_opportunity").length >= 3);
      const start = await page.evaluate(() => performance.now());
      const observations = [];
      const observe = async () => observations.push(await page.evaluate(() => {
        const probe = window.__nexusPerformance.snapshot();
        return { atMs: performance.now(), visibility: document.visibilityState, rawPoints: probe.counts.rawPoints,
          displayedPoints: probe.counts.displayedPoints, domNodes: document.querySelectorAll("*").length,
          // Chromium-only, approximate legacy heap telemetry. No forced GC and no leak claim.
          jsHeapUsedBytes: performance.memory?.usedJSHeapSize ?? null,
          jsHeapTotalBytes: performance.memory?.totalJSHeapSize ?? null };
      }));
      await observe();
      let interactions = 0;
      // Seven repetitions per main run yield 21 samples/action across three runs.
      const cycles = soak ? 0 : options.seconds >= 20 ? 7 : 1;
      for (let cycle = 0; cycle < cycles; cycle += 1) {
        for (const [label, action] of [["확대", "zoom"], ["이전 구간", "pan"], ["이상 구간으로 이동", "focus_incident"], ["실시간 따라가기", "follow_live"]]) {
          const name = `interaction_${action}_to_frame_opportunity`;
          const previous = await page.evaluate((metric) => window.__nexusPerformance.snapshot().measurements.filter((item) => item.name === metric).length, name);
          await page.getByRole("button", { name: label, exact: true }).click();
          await page.waitForFunction(({ metric, count }) => window.__nexusPerformance.snapshot().measurements.filter((item) => item.name === metric).length > count, { metric: name, count: previous });
          interactions += 1;
        }
      }
      let elapsed = (await page.evaluate(() => performance.now())) - start;
      while (elapsed < seconds * 1000) {
        await page.waitForTimeout(Math.min(5000, seconds * 1000 - elapsed));
        await observe();
        elapsed = (await page.evaluate(() => performance.now())) - start;
        if (soak) console.log(`  ${equipmentId} visible stream ${Math.round(elapsed / 1000)}/${seconds}s, ${observations.at(-1).rawPoints} points`);
      }
      const observationEnd = await page.evaluate(() => performance.now());
      await page.getByRole("button", { name: "현장 검증 시작", exact: true }).click();
      const dialog = page.getByRole("dialog");
      for (const checkbox of await dialog.getByRole("checkbox").all()) await checkbox.check();
      await dialog.getByRole("button", { name: "검증 작업 지시 발행", exact: true }).click();
      await expect(page.getByTestId("verification-success")).toBeVisible();
      await page.waitForFunction(() => window.__nexusPerformance.snapshot().measurements.some((item) => item.name === "verification_submit_to_result_frame_opportunity"));
      const snapshot = await page.evaluate(() => window.__nexusPerformance.snapshot());
      const steadyMeasurements = snapshot.measurements.filter((item) => item.startTime >= start && item.startTime < observationEnd);
      const steadyTasks = snapshot.longTasks.filter((item) => item.startTime >= start && item.startTime < observationEnd);
      const result = {
        equipmentId, runNumber, kind: soak ? "soak" : "journey", requestedObservationSeconds: seconds,
        observation: { startMs: start, endMs: observationEnd, durationMs: observationEnd - start, scriptedChartInteractions: interactions },
        summary: summarize(snapshot.measurements), steadySummary: summarize(steadyMeasurements),
        longTasks: { all: snapshot.longTasks.length, steady: steadyTasks.length, steadyBlockingMs: round(steadyTasks.reduce((sum, task) => sum + Math.max(0, task.durationMs - 50), 0)) },
        observations, raw: snapshot, network, errors,
      };
      expect(errors).toEqual([]);
      expect(network.httpErrors).toEqual([]);
      expect(network.failed).toEqual([]);
      expect(snapshot.visibility).toBe("visible");
      expect(snapshot.counts.hiddenFrames).toBe(0);
      expect(snapshot.counts.droppedMeasurements).toBe(0);
      expect(observations.every((item) => item.visibility === "visible" && item.rawPoints <= 20_000 && item.displayedPoints <= 1_800)).toBe(true);
      console.log(`  click→history frame ${result.summary.equipment_click_to_history_frame_opportunity.medianMs}ms; history→frame ${result.summary.history_request_to_frame_opportunity.medianMs}ms; live latest→frame p95 ${result.steadySummary.stream_latest_receive_to_frame_opportunity?.p95Ms ?? "N<20"}ms; steady long tasks ${steadyTasks.length}`);
      results.push(result);
    } finally {
      await context.close();
    }
  }

  for (let run = 1; run <= options.runs; run += 1) {
    // Alternate equipment to reduce a fixed ordering bias; caches are fresh browser contexts.
    for (const id of run % 2 ? ["COATER-02", "DRYER-02"] : ["DRYER-02", "COATER-02"]) await measureRun(id, run, options.seconds);
  }
  if (options.soakSeconds > 0) await measureRun("COATER-02", 1, options.soakSeconds, true);
  const aggregated = Object.fromEntries(["COATER-02", "DRYER-02"].map((id) => {
    const runs = results.filter((item) => item.kind === "journey" && item.equipmentId === id);
    return [id, { all: summarize(runs.flatMap((item) => item.raw.measurements)),
      steady: summarize(runs.flatMap((item) => item.raw.measurements.filter((metric) => metric.startTime >= item.observation.startMs && metric.startTime < item.observation.endMs))),
      longTasks: runs.reduce((sum, item) => sum + item.longTasks.steady, 0) }];
  }));
  const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  const artifact = {
    schemaVersion: 1, generatedAt: new Date().toISOString(),
    environment: { cpu: cpus()[0]?.model, logicalCores: cpus().length, platform: platform(), osRelease: release(), node: process.version, chromium: browserVersion, dependencyVersions, headless: true, viewport: { width: 1440, height: 1024 }, deviceScaleFactor: 1, transport: "loopback HTTP + WebSocket; no network/CPU throttling", build: "App-local Vite production minified; VITE_PERFORMANCE_PROBE=true; Sentry disabled; static responses no-store" },
    source: { baseCommit: git(["rev-parse", "HEAD"]), dirty: Boolean(git(["status", "--porcelain"])), sha256: hashes },
    protocol: { runsPerEquipment: options.runs, observationSeconds: options.seconds, soakSeconds: options.soakSeconds, historyPoints: 18000, sensorFieldsPerPoint: 5, streamIntervalMs: 250, commitIntervalMs: 500,
      startup: "fresh browser context → overview → equipment click handler (before navigation/lazy route loading) → history request through validation/state/chart; all first-load samples retained; excludes initial overview page navigation",
      steady: "starts after first history frame and at least 3 streaming frame opportunities; 7 zoom/pan/focus/follow cycles per >=20s journey; soak has no chart inputs",
      timing: "ECharts finished + two requestAnimationFrame callbacks: render-frame opportunity, NOT compositor/pixel presentation",
      p95: "nearest rank; null when fewer than 20 samples; repeated stream samples within a run are not independent devices/users",
      eventTiming: "native PerformanceEventTiming >=16ms (8ms rounding); sub-threshold inputs absent, not a production INP score",
      heap: "performance.memory approximate Chromium-only used/total heap; sampled without forced GC; bounded observation cannot prove no leak",
      excludes: ["Vercel CDN/serverless cold starts", "public WAN/industrial network", "multi-user load", "physical sensors", "8-hour stability", "mobile/low-end CPU", "production RUM/SLA"] },
    aggregated, runs: results,
  };
  // Keep prior evidence immutable. Reproduction must use a new output filename.
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ output: outputPath, aggregated }, null, 2));
} finally {
  await browser?.close();
  stream?.close();
  server.closeAllConnections();
  if (server.listening) await new Promise((done) => server.close(done));
  // Keep this named temporary build for inspection; only the explicit JSON output is portfolio evidence.
}
