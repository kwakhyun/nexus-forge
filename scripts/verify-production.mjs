const origin = process.env.PRODUCTION_URL;
const expectedRelease = process.env.EXPECTED_RELEASE;
const timeoutMs = Number(process.env.DEPLOY_TIMEOUT_MS ?? 6 * 60_000);
const pollIntervalMs = 10_000;

if (!origin || !expectedRelease) {
  throw new Error("PRODUCTION_URL and EXPECTED_RELEASE are required");
}

const normalizedOrigin = origin.replace(/\/$/, "");
const deadline = Date.now() + timeoutMs;

async function getJson(path) {
  const response = await fetch(`${normalizedOrigin}${path}`, {
    headers: { "Cache-Control": "no-cache" },
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
  const [overview, summary, history] = await Promise.all([
    fetch(`${normalizedOrigin}/overview`, { headers: { "Cache-Control": "no-cache" } }),
    getJson("/api/plant/summary"),
    getJson("/api/equipment/COATER-02/history?intervalMs=100"),
  ]);

  if (!overview.ok || !(await overview.text()).includes('<div id="root">')) {
    throw new Error("Production overview shell is unavailable");
  }
  if (summary?.activeIncident?.equipmentId !== "COATER-02") {
    throw new Error("Production summary contract is invalid");
  }
  if (!Array.isArray(history?.points) || history.points.length < 10_000) {
    throw new Error("Production history contract is invalid");
  }
}

async function verifySensorStream() {
  const streamUrl = normalizedOrigin.replace(/^http/, "ws") + "/stream";

  await new Promise((resolve, reject) => {
    const socket = new WebSocket(streamUrl);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error("Production sensor stream did not deliver a point within 15 seconds"));
    }, 15_000);

    socket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(String(event.data));
        if (message?.type !== "sensor.point" || typeof message?.point?.timestamp !== "number") return;
        clearTimeout(timer);
        socket.close();
        resolve();
      } catch {
        // Keep waiting for a valid sensor frame.
      }
    });
    socket.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("Production sensor stream connection failed"));
    });
  });
}

await waitForExpectedRelease();
await verifyHttpSurfaces();
await verifySensorStream();
console.log(`Verified production release ${expectedRelease.slice(0, 7)} across UI, REST, history, and WebSocket.`);
