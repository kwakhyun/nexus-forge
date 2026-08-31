const origin = process.env.PRODUCTION_URL;
const expectedRelease = process.env.EXPECTED_RELEASE;
const timeoutMs = Number(process.env.DEPLOY_TIMEOUT_MS ?? 6 * 60_000);
const pollIntervalMs = 10_000;
const equipmentIds = ["COATER-02", "DRYER-02"];
const pageRoutes = ["/overview", ...equipmentIds.map((id) => `/diagnostics/${id}`), "/production", "/incidents", "/maintenance", "/notifications", "/settings"];

if (!origin || !expectedRelease) {
  throw new Error("PRODUCTION_URL and EXPECTED_RELEASE are required");
}

const normalizedOrigin = origin.replace(/\/$/, "");
const deadline = Date.now() + timeoutMs;

async function getJson(path) {
  const response = await fetch(`${normalizedOrigin}${path}`, {
    headers: { "Cache-Control": "no-cache" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response.json();
}

async function waitForExpectedRelease() {
  let lastRelease = "unavailable";

  while (Date.now() < deadline) {
    try {
      const health = await getJson(`/api/health?releaseCheck=${Date.now()}`);
      lastRelease = typeof health.release === "string" ? health.release : "unavailable";
      if (health.status === "ok" && lastRelease === expectedRelease) return;
    } catch (error) {
      console.log(`Production health is not ready: ${error instanceof Error ? error.message : String(error)}`);
    }

    console.log(`Waiting for release ${expectedRelease.slice(0, 7)}; current release is ${lastRelease.slice(0, 7)}`);
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`Production did not expose release ${expectedRelease.slice(0, 7)} within ${timeoutMs}ms`);
}

async function verifyHttpSurfaces() {
  const summary = await getJson("/api/plant/summary");
  if (summary?.activeIncident?.equipmentId !== "COATER-02") {
    throw new Error("Production summary contract is invalid");
  }
  for (const equipmentId of equipmentIds) {
    if (!summary.diagnosticIncidents?.some((incident) => incident.equipmentId === equipmentId)) {
      throw new Error(`Production summary does not include ${equipmentId}`);
    }
    const history = await getJson(`/api/equipment/${equipmentId}/history?intervalMs=100`);
    if (history?.equipmentId !== equipmentId || !Array.isArray(history.points) || history.points.length < 10_000) {
      throw new Error(`Production history contract is invalid for ${equipmentId}`);
    }
  }
  const production = await getJson("/api/production");
  if (production?.source !== "simulation" || !Array.isArray(production.runs)
    || !["COATING-LINE-01", "COATING-LINE-02"].every((lineId) => production.runs.some((run) => run.lineId === lineId))) {
    throw new Error("Production runs do not include both synthetic lines");
  }
  await Promise.all(pageRoutes.map(async (path) => {
    const response = await fetch(`${normalizedOrigin}${path}`, {
      headers: { "Cache-Control": "no-cache" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok || !(await response.text()).includes('<div id="root">')) {
      throw new Error(`Production UI shell is unavailable at ${path}`);
    }
  }));
}

async function verifySensorStream(equipmentId) {
  const streamUrl = normalizedOrigin.replace(/^http/, "ws") + `/stream?equipmentId=${encodeURIComponent(equipmentId)}`;

  await new Promise((resolve, reject) => {
    const socket = new WebSocket(streamUrl);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`Production sensor stream for ${equipmentId} did not deliver a point within 15 seconds`));
    }, 15_000);

    socket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(String(event.data));
        if (message?.type !== "sensor.point") return;
        if (message.equipmentId !== equipmentId
          || !["timestamp", "webTensionLeft", "webTensionRight", "ovenTemperature", "lineSpeed", "defectRate"].every((key) => Number.isFinite(message.point?.[key]))) {
          clearTimeout(timer);
          socket.close();
          reject(new Error(`Production sensor frame does not match ${equipmentId}`));
          return;
        }
        clearTimeout(timer);
        socket.close();
        resolve();
      } catch {
        // Keep waiting for a valid sensor frame.
      }
    });
    socket.addEventListener("error", () => {
      clearTimeout(timer);
      socket.close();
      reject(new Error(`Production sensor stream connection failed for ${equipmentId}`));
    });
  });
}

await waitForExpectedRelease();
await verifyHttpSurfaces();
await Promise.all(equipmentIds.map(verifySensorStream));
console.log(`Verified production release ${expectedRelease.slice(0, 7)} across ${pageRoutes.length} UI shells, both production lines, and history/WebSocket for ${equipmentIds.join(", ")}.`);
