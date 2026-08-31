import { expect, test, type Page } from "@playwright/test";
import axe from "axe-core";

async function openDiagnostics(page: Page) {
  await page.goto("/diagnostics/COATER-02");
  await expect(page.getByRole("button", { name: "현장 검증 시작", exact: true })).toBeEnabled({ timeout: 15_000 });
}

for (const failure of ["http", "malformed"]) {
  test(`initial summary ${failure} failure has navigation and a working retry`, async ({ page }) => {
    let unavailable = true;
    await page.route("**/api/plant/summary", async (route) => {
      if (!unavailable) return route.continue();
      await route.fulfill({ status: failure === "http" ? 503 : 200, contentType: "application/json", body: "{}" });
    });
    await page.goto("/overview");
    await expect(page.getByRole("heading", { name: "공정 현황을 불러오지 못했습니다." })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("navigation", { name: "주요 화면" })).toBeVisible();
    unavailable = false;
    await page.getByRole("button", { name: "다시 시도", exact: true }).click();
    await expect(page.getByRole("heading", { name: "라인 현황", exact: true })).toBeVisible();
  });
}

test("an unsupported equipment URL never shows COATER-02 data as its own", async ({ page }) => {
  const historyRequests: string[] = [];
  page.on("request", (request) => { if (request.url().includes("/history?")) historyRequests.push(request.url()); });
  await page.goto("/diagnostics/COATER-01");
  await expect(page.getByRole("heading", { name: "이 설비의 진단 화면은 제공하지 않습니다." })).toBeVisible();
  expect(historyRequests).toEqual([]);
  await expect(page.getByRole("img", { name: /같은 시간축/ })).toHaveCount(0);
  await page.getByRole("link", { name: "공정 개요로 돌아가기" }).click();
  await expect(page.getByRole("heading", { name: "라인 현황" })).toBeVisible();
});

test("overview evidence navigation opens all evidence and focuses its heading", async ({ page }) => {
  await page.goto("/overview");
  await page.getByRole("button", { name: "전체 근거 보기", exact: true }).click();
  await expect(page).toHaveURL(/\/diagnostics\/COATER-02#evidence$/);
  await expect(page.getByRole("heading", { name: "주요 근거", exact: true })).toBeFocused();
  await expect(page.locator(".evidence-list li").filter({ hasText: "비전 검사 엣지 웨이브 결함률" })).toBeVisible();
  await expect(page.getByRole("button", { name: "근거 접기" })).toHaveAttribute("aria-expanded", "true");
});

test("annotations remain bounded, visible and available after navigating away", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDiagnostics(page);
  await page.getByRole("button", { name: "주석 추가", exact: true }).click();
  const input = page.getByLabel("현장 관찰 내용");
  await expect(input).toHaveAttribute("maxlength", "240");
  const note = "현장점검기록".repeat(40);
  await input.fill(note);
  await page.getByRole("button", { name: "타임라인에 추가" }).click();
  await expect(page.getByRole("button", { name: "주석 추가", exact: true })).toBeFocused();
  const annotation = page.getByText(`작업자 주석: ${note}`, { exact: true });
  await expect(annotation).toBeVisible();
  expect(await annotation.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.getByRole("link", { name: "전체 공정", exact: true }).click();
  await page.getByRole("link", { name: "신호 분석", exact: true }).click();
  await expect(annotation).toBeVisible();
});

test("pending issuance is locked and a lost response retries the same order after navigation", async ({ page, request }) => {
  test.setTimeout(45_000);
  const payloads: Array<{ requestId: string }> = [];
  let unlock!: () => void;
  const gate = new Promise<void>((resolve) => { unlock = resolve; });
  let issuedId = "";
  await page.route("**/api/verifications", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    payloads.push(route.request().postDataJSON());
    const response = await route.fetch();
    if (payloads.length === 1) {
      issuedId = (await response.json()).id;
      await gate;
      await route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"response_lost"}' });
    } else await route.fulfill({ response });
  });
  await openDiagnostics(page);
  await page.getByLabel("사용자 역할").selectOption("manager");
  await page.getByRole("button", { name: "현장 검증 요청", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("작업 담당자").selectOption("공정 기술팀 최유진");
  for (const checkbox of await dialog.getByRole("checkbox").all()) await checkbox.check();
  await dialog.getByRole("button", { name: "검증 작업 지시 발행", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "취소" })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "닫기", exact: true })).toBeDisabled();
  await expect(dialog.getByLabel("작업 담당자")).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  expect(await page.locator(".app-header").evaluate((element) => (element as HTMLElement).inert)).toBe(true);
  unlock();
  await expect(dialog.getByRole("button", { name: "같은 요청으로 다시 확인" })).toBeEnabled();
  await dialog.getByRole("button", { name: "취소" }).click();
  await page.getByRole("link", { name: "전체 공정", exact: true }).click();
  await page.getByRole("link", { name: "신호 분석", exact: true }).click();
  await page.getByRole("button", { name: "현장 검증 요청", exact: true }).click();
  await dialog.getByRole("button", { name: "같은 요청으로 다시 확인" }).click();
  await expect(page.getByTestId("verification-success")).toContainText(issuedId);
  expect(payloads).toHaveLength(2);
  expect(payloads[1]).toEqual(payloads[0]);
  const records = await (await request.get("/api/verifications")).json();
  expect(records.filter((record: { id: string }) => record.id === issuedId)).toHaveLength(1);
  await dialog.getByRole("button", { name: "진단 화면으로 돌아가기" }).click();
  await page.getByRole("button", { name: "발행한 작업 지시 보기" }).click();
  await expect(page.getByTestId("verification-success")).toContainText(issuedId);
  expect(payloads).toHaveLength(2);
});

test("heartbeat-only traffic blocks issuance and removes misleading live KPI values", async ({ page }) => {
  let sendPoints = true;
  let timer: ReturnType<typeof setInterval> | undefined;
  await page.routeWebSocket("**/stream", (socket) => {
    let sequence = 0;
    timer = setInterval(() => {
      const now = Date.now();
      socket.send(JSON.stringify(sendPoints
        ? { type: "sensor.point", sequence: sequence++, point: { timestamp: now, webTensionLeft: 31, webTensionRight: 32, ovenTemperature: 160, lineSpeed: 80, defectRate: 0.2 } }
        : { type: "heartbeat", serverTime: now }));
    }, 250);
    socket.onClose(() => clearInterval(timer));
  });
  try {
    await openDiagnostics(page);
    sendPoints = false;
    await expect(page.getByText("센서 데이터 지연", { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "현장 검증 보류", exact: true })).toBeDisabled();
    await expect(page.getByRole("progressbar", { name: "원인 분석 신뢰도" })).toHaveCount(0);
    await page.getByRole("link", { name: "전체 공정", exact: true }).click();
    await expect(page.locator(".nf-kpi").filter({ hasText: "현재 좌측 웹 장력" })).toContainText("—");
    await expect(page.getByText(/최신 센서 값을 확인할 수 없습니다/)).toBeVisible();
  } finally { clearInterval(timer); }
});

test("background summary errors retain the last screen with a visible recovery path", async ({ page }) => {
  let unavailable = false;
  await page.route("**/api/plant/summary", async (route) => {
    if (unavailable) await route.fulfill({ status: 503, body: "{}", contentType: "application/json" });
    else await route.continue();
  });
  await page.goto("/overview");
  await expect(page.getByRole("heading", { name: "라인 현황" })).toBeVisible();
  unavailable = true;
  const alert = page.getByRole("alert").filter({ hasText: "공정 현황 갱신이 지연되고 있습니다" });
  await expect(alert).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "라인 현황" })).toBeVisible();
  unavailable = false;
  await alert.getByRole("button", { name: "현황 다시 불러오기" }).click();
  await expect(alert).toHaveCount(0);
});

test("short desktop and mobile dialogs allow reaching every control without clipping", async ({ page }) => {
  await openDiagnostics(page);
  for (const viewport of [{ width: 1280, height: 540 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(viewport);
    await page.getByRole("button", { name: "현장 검증 시작", exact: true }).click();
    const dialog = page.getByRole("dialog");
    for (const checkbox of await dialog.getByRole("checkbox").all()) await checkbox.check();
    const issue = dialog.getByRole("button", { name: "검증 작업 지시 발행", exact: true });
    await issue.scrollIntoViewIfNeeded();
    await expect(issue).toBeEnabled();
    const bounds = await issue.boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
    const fits = await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1);
    expect(fits).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  }
});

test("chart buttons expose the viewed range and retain a fixed range across live updates", async ({ page }) => {
  await openDiagnostics(page);
  const region = page.getByLabel("차트 표시 구간");
  await page.getByRole("button", { name: "이상 구간으로 이동", exact: true }).click();
  await expect(region).toContainText("구간 고정");
  const fixed = await region.textContent();
  const renderStat = page.locator(".render-stat");
  await expect(renderStat).toContainText(/원본 [\d,]+개 시점 \/ 표시 [\d,]+개 · Canvas/);
  const before = await renderStat.textContent();
  await expect(async () => expect(await renderStat.textContent()).not.toBe(before)).toPass({ timeout: 5_000 });
  expect(await region.textContent()).toBe(fixed);
  await page.getByRole("button", { name: "확대", exact: true }).click();
  await expect(region).not.toHaveText(fixed!);
  await page.getByRole("button", { name: "실시간 따라가기", exact: true }).click();
  await expect(region).toContainText("실시간 갱신");
});

for (const screen of ["overview", "diagnostics", "dryer-diagnostics", "dialog"]) {
  test(`${screen} has no automated WCAG A/AA accessibility violations`, async ({ page }) => {
    if (screen === "overview") {
      await page.goto("/overview");
      await expect(page.getByRole("heading", { name: "라인 현황" })).toBeVisible();
    } else if (screen === "dryer-diagnostics") {
      await page.goto("/diagnostics/DRYER-02");
      await expect(page.getByLabel("이상 발생 시점 센서값", { exact: true })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("button", { name: "현장 검증 시작", exact: true })).toBeEnabled();
    } else {
      await openDiagnostics(page);
      if (screen === "dialog") await page.getByRole("button", { name: "현장 검증 시작", exact: true }).click();
    }
    await page.addScriptTag({ content: axe.source });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const violations = await page.evaluate(async () => {
        const engine = (window as unknown as { axe: typeof axe }).axe;
        const result = await engine.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
        return result.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })) }));
      });
      expect(violations, `${width}px accessibility`).toEqual([]);
    }
  });
}
