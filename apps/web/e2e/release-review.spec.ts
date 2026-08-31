import { expect, test, type Page } from "@playwright/test";

async function expectReady(page: Page, route: string) {
  if (route === "/overview") {
    await expect(page.getByRole("heading", { name: "라인 현황", exact: true })).toBeVisible();
  } else if (route.startsWith("/diagnostics/")) {
    await expect(page.getByRole("button", { name: "현장 검증 시작", exact: true })).toBeEnabled({ timeout: 15_000 });
    await expect(page.getByLabel("이상 발생 시점 센서값", { exact: true })).toBeVisible();
  } else {
    await expect(page.locator(".workspace-scope")).toContainText("기록은 이 브라우저에만 보관");
    if (route === "/production") await expect(page.locator(".workspace-table tbody tr")).toHaveCount(24);
    if (route === "/incidents") await expect(page.getByRole("region", { name: "이상 상세", exact: true })).toBeVisible();
    if (route === "/maintenance") await expect(page.getByRole("region", { name: "작업 지시 상세", exact: true })).toBeVisible();
    if (route === "/notifications") await expect(page.getByRole("list", { name: "알림 목록", exact: true }).getByRole("listitem")).toHaveCount(2);
    if (route === "/settings") await expect(page.getByLabel("실시간 차트 기본 범위", { exact: true })).toBeEnabled();
  }
}

async function readLayout(page: Page) {
  return page.evaluate(() => ({
    pageOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
    clipped: [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((element) => {
        if (!element.clientWidth || element.matches("svg, svg *, input, textarea, select, option, .sr-only")) return false;
        const style = getComputedStyle(element);
        return (!["auto", "scroll"].includes(style.overflowX) && element.scrollWidth > element.clientWidth + 2)
          || (["hidden", "clip"].includes(style.overflowY) && element.scrollHeight > element.clientHeight + 2);
      })
      .map((element) => `${element.tagName}.${element.className}`),
  }));
}

test("all eight route instances finish loading without clipping at both final mobile viewports", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const results: unknown[] = [];
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const route of ["/overview", "/diagnostics/COATER-02", "/diagnostics/DRYER-02", "/production", "/incidents", "/maintenance", "/notifications", "/settings"]) {
      await test.step(`${route} at ${viewport.width}×${viewport.height}`, async () => {
        await page.goto(route);
        await expectReady(page, route);
        await expect.poll(() => readLayout(page)).toEqual({ pageOverflow: 0, clipped: [] });
        const activeMenu = page.getByRole("navigation", { name: "제품 탐색", exact: true }).locator('[aria-current="page"]');
        if (await activeMenu.count()) {
          await expect.poll(() => activeMenu.evaluate((item) => {
            const parent = item.closest("nav")!.getBoundingClientRect();
            const bounds = item.getBoundingClientRect();
            return bounds.left >= parent.left && bounds.right <= parent.right;
          })).toBe(true);
        }
        if (viewport.width === 390 && ["/notifications", "/settings"].includes(route)) {
          const name = route.slice(1);
          await page.screenshot({ path: testInfo.outputPath(`${name}-390-top.png`) });
          if (route === "/notifications") {
            const lastAction = page.getByRole("button", { name: "관련 기록 보기", exact: true }).last();
            await lastAction.scrollIntoViewIfNeeded();
            await expect(lastAction).toBeInViewport({ ratio: 1 });
          } else {
            await page.locator("summary").filter({ hasText: "데모 기록 초기화" }).click();
            await page.getByLabel("확인 문구", { exact: true }).fill("삭제하지 않음");
            const reset = page.getByRole("button", { name: "데모 기록 삭제 및 초기화", exact: true });
            await expect(reset).toBeDisabled();
            await reset.scrollIntoViewIfNeeded();
            await expect(reset).toBeInViewport({ ratio: 1 });
          }
          await expect.poll(() => readLayout(page)).toEqual({ pageOverflow: 0, clipped: [] });
          await page.screenshot({ path: testInfo.outputPath(`${name}-390-bottom.png`) });
        }
        results.push({ route, viewport, ready: true, ...await readLayout(page) });
      });
    }
  }
  expect(errors).toEqual([]);
  expect(results).toHaveLength(16);
  await testInfo.attach("final-mobile-layout-matrix", { body: JSON.stringify(results, null, 2), contentType: "application/json" });
});

for (const equipmentId of ["COATER-02", "DRYER-02"]) {
  test(`${equipmentId} hash navigation reveals actions and reopens evidence without resetting the rail`, async ({ page }) => {
    test.setTimeout(60_000);
    for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
      await test.step(`${viewport.width}×${viewport.height}`, async () => {
        await page.setViewportSize(viewport);
        await page.goto(`/diagnostics/${equipmentId}#recommended-action`);
        await expectReady(page, `/diagnostics/${equipmentId}`);
        const actionHeading = page.getByRole("heading", { name: "권장 조치", exact: true });
        const action = page.getByRole("button", { name: "현장 검증 시작", exact: true });
        await expect(actionHeading).toBeFocused();
        await expect(action).toBeInViewport({ ratio: 1 });
        const navigation = page.getByRole("navigation", { name: "진단 화면 내 이동", exact: true });
        await navigation.getByRole("link", { name: "이벤트와 주석", exact: true }).click();
        await expect(page.getByRole("heading", { name: "이벤트", exact: true })).toBeFocused();
        await navigation.getByRole("link", { name: "원인 근거", exact: true }).click();
        const evidence = page.getByRole("region", { name: "주요 근거", exact: true });
        await expect(evidence.getByRole("listitem")).toHaveCount(3);
        await page.getByRole("button", { name: "근거 접기", exact: true }).click();
        await expect(evidence.getByRole("listitem")).toHaveCount(2);
        await navigation.getByRole("link", { name: "현장 검증", exact: true }).click();
        await expect(actionHeading).toBeFocused();
        await expect(action).toBeInViewport({ ratio: 1 });
        await navigation.getByRole("link", { name: "원인 근거", exact: true }).click();
        await expect(evidence.getByRole("heading")).toBeFocused();
        await expect(evidence.getByRole("listitem")).toHaveCount(3);
      });
    }
  });
}

test("native Tab, reverse Tab, skip navigation and arrow scrolling work in the mobile workspace", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings");
  await expectReady(page, "/settings");
  await page.getByRole("heading", { name: "설정", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "보관 범위 확인", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("실시간 차트 기본 범위", { exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("link", { name: "보관 범위 확인", exact: true })).toBeFocused();
  await page.getByRole("link", { name: "본문으로 건너뛰기", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  const previousScroll = await page.evaluate(() => document.scrollingElement!.scrollTop);
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => page.evaluate(() => document.scrollingElement!.scrollTop)).toBeGreaterThan(previousScroll);
});

test("production line filters include both coater and dryer cases without mixing lines", async ({ page }) => {
  await page.goto("/production");
  await expectReady(page, "/production");
  const openCases = page.locator(".operational-metrics > div").filter({ hasText: "현재 미종결 이상" }).locator("strong");
  await expect(openCases).toHaveText("2건");
  await page.getByRole("combobox", { name: "생산 라인", exact: true }).selectOption("COATING-LINE-02");
  await expect(openCases).toHaveText("2건");
  await page.getByRole("combobox", { name: "생산 라인", exact: true }).selectOption("COATING-LINE-01");
  await expect(openCases).toHaveText("0건");
  await page.getByRole("combobox", { name: "생산 라인", exact: true }).selectOption("all");
  await expect(openCases).toHaveText("2건");
  await expect(page.locator(".production-metrics")).not.toContainText("-0.00%p");
});
