import { expect, test, type WebSocketRoute } from "@playwright/test";

for (const path of ["/overview/", "/Overview"]) {
  test(`${path} receives live sensor data`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "라인 현황", exact: true })).toBeVisible();
    await expect(page.getByText("데이터 수신 정상", { exact: true })).toBeVisible();
    await expect(page.getByText("최신 센서 값을 확인할 수 없습니다.", { exact: false })).toHaveCount(0);
    await expect(page.locator(".nf-kpi").filter({ hasText: "현재 좌측 웹 장력" })).not.toContainText("—");
  });
}

test("a quick return refreshes fresh cached history before allowing new work", async ({ page }) => {
  // Keep query timestamps fresh even when the test machine is slow; timers still run.
  await page.clock.setFixedTime(new Date());
  let requests = 0;
  let returning = false;
  let releaseHistory!: () => void;
  const heldHistory = new Promise<void>((resolve) => { releaseHistory = resolve; });
  await page.route("**/api/equipment/COATER-02/history?*", async (route) => {
    requests += 1;
    const response = await route.fetch();
    const history = await response.json();
    if (returning) {
      for (const point of history.points) point.webTensionLeft = 37.7;
      await heldHistory;
    }
    await route.fulfill({ json: history });
  });
  await page.goto("/diagnostics/COATER-02");
  await expect(page.getByRole("button", { name: "현장 검증 시작", exact: true })).toBeEnabled();
  await page.getByRole("link", { name: "정비 관리", exact: true }).click();
  await expect(page.getByText("실시간 수신 대기", { exact: true })).toBeVisible();
  const initialRequests = requests;
  returning = true;
  await page.getByRole("link", { name: "신호 분석", exact: true }).click();
  try {
    await expect.poll(() => requests).toBeGreaterThan(initialRequests);
    await expect(page.getByRole("button", { name: "이력 확인 중", exact: true })).toBeDisabled();
  } finally {
    releaseHistory();
  }
  await expect(page.getByLabel("이상 발생 시점 센서값", { exact: true })).toContainText("37.7 N");
  await expect(page.getByRole("button", { name: "현장 검증 시작", exact: true })).toBeEnabled();
});

test("socket reconnection backfills history without a route change", async ({ page }) => {
  const sockets: WebSocketRoute[] = [];
  let disconnected = false;
  let recoveryRequests = 0;
  await page.routeWebSocket("**/stream**", (socket) => {
    socket.connectToServer();
    sockets.push(socket);
  });
  await page.route("**/api/equipment/COATER-02/history?*", async (route) => {
    const response = await route.fetch();
    const history = await response.json();
    if (disconnected) {
      recoveryRequests += 1;
      for (const point of history.points) point.webTensionLeft = 36.6;
    }
    await route.fulfill({ json: history });
  });
  await page.goto("/diagnostics/COATER-02");
  await expect(page.getByRole("button", { name: "현장 검증 시작", exact: true })).toBeEnabled();
  const initialSockets = sockets.length;
  disconnected = true;
  await sockets.at(-1)!.close({ code: 1012, reason: "test reconnect" });
  await expect.poll(() => sockets.length).toBeGreaterThan(initialSockets);
  await expect.poll(() => recoveryRequests).toBeGreaterThan(0);
  await expect(page.getByLabel("이상 발생 시점 센서값", { exact: true })).toContainText("36.6 N");
  await expect(page.getByRole("button", { name: "현장 검증 시작", exact: true })).toBeEnabled();
});
