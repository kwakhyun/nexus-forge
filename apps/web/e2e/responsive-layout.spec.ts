import { expect, test, type Page } from "@playwright/test";

// Include both sides of layout breakpoints, not only common device presets.
const viewportWidths = [1920, 1440, 1366, 1280, 1180, 1024, 1000, 821, 820, 701, 700, 521, 520, 390, 320];

async function expectContainedLayout(page: Page) {
  const overflow = await page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>("body *"));
    return {
      page: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
      elements: elements
        .filter((element) => {
          if (!element.clientWidth || element.matches("svg, svg *, .sr-only")) return false;
          // The process strip, toolbar and timeline deliberately scroll locally.
          if (["auto", "scroll"].includes(getComputedStyle(element).overflowX)) return false;
          return element.scrollWidth > element.clientWidth + 1;
        })
        .map((element) => ({
          element: `${element.tagName}.${element.className}`,
          text: element.textContent?.slice(0, 100),
          width: element.clientWidth,
          contentWidth: element.scrollWidth,
        })),
    };
  });
  expect(overflow.page, "The page must not scroll horizontally").toBeLessThanOrEqual(1);
  expect(overflow.elements, "Text must fit; local scroll regions are explicitly excluded").toEqual([]);
}

async function expectDiagnosticStack(page: Page) {
  const violations = await page.evaluate(() => {
    const issues: string[] = [];
    const inspect = (selector: string, ordered: boolean, contain: boolean) => {
      for (const parent of document.querySelectorAll<HTMLElement>(selector)) {
        const parentBounds = parent.getBoundingClientRect();
        let previousBottom: number | null = null;
        for (const child of Array.from(parent.children)) {
          const bounds = child.getBoundingClientRect();
          if (!bounds.width || !bounds.height) continue;
          const label = `${selector} > ${child.tagName}.${child.className}`;
          if (contain && (bounds.top < parentBounds.top - 1 || bounds.bottom > parentBounds.bottom + 1)) {
            issues.push(`${label}: outside parent (top ${bounds.top - parentBounds.top}px, bottom ${bounds.bottom - parentBounds.bottom}px)`);
          }
          if (ordered && previousBottom !== null && bounds.top < previousBottom - 1) {
            issues.push(`${label}: overlaps previous section by ${previousBottom - bounds.top}px`);
          }
          previousBottom = bounds.bottom;
        }
      }
    };
    // The main panel deliberately scrolls vertically, but its sections must not overlap.
    inspect(".diagnostic-main", true, false);
    inspect(".signal-workbench", true, true);
    inspect(".signal-chart-wrap", false, true);
    inspect(".current-values", false, true);
    inspect(".current-values > div", false, true);
    inspect(".event-timeline", true, true);
    const chart = document.querySelector(".signal-chart")?.getBoundingClientRect();
    const chartRow = document.querySelector(".signal-chart-wrap")?.getBoundingClientRect();
    if (!chart || !chartRow || chart.height < 420 || Math.abs(chart.height - chartRow.height) > 1) {
      issues.push("Chart must retain its readable height and fill its allocated row");
    }
    return issues;
  });
  expect(violations, "Reference values and events must fit vertically without covering each other").toEqual([]);
}

test("diagnostic reference cards and events never overlap vertically", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/diagnostics/COATER-02");
  const referenceValues = page.getByLabel("이상 발생 시점 센서값", { exact: true });
  await expect(referenceValues).toBeVisible({ timeout: 15_000 });
  await expect(referenceValues.locator("dd")).toHaveCount(7);

  for (const viewport of [
    { width: 1920, height: 900 }, { width: 1920, height: 720 },
    { width: 1440, height: 900 }, { width: 1440, height: 540 },
    { width: 1280, height: 720 }, { width: 1280, height: 540 },
    { width: 1180, height: 720 }, { width: 1024, height: 768 },
    { width: 701, height: 600 }, { width: 700, height: 600 },
    { width: 390, height: 844 }, { width: 320, height: 568 },
  ]) {
    await test.step(`${viewport.width}×${viewport.height}`, async () => {
      await page.setViewportSize(viewport);
      await expect(async () => expectDiagnosticStack(page)).toPass({ timeout: 5_000 });
      // The second tension value and temperature setpoint were cut off in the report.
      for (const value of await referenceValues.locator(".current-values__pair dd:last-child").all()) {
        await value.scrollIntoViewIfNeeded();
        await expect(value).toBeInViewport({ ratio: 1 });
      }
    });
  }

  // Exercise content-driven height changes, not just the initial empty timeline.
  await page.getByRole("button", { name: "주석 추가", exact: true }).click();
  await expectDiagnosticStack(page);
  await page.getByLabel("현장 관찰 내용").fill("장력과 온도 참고값을 확인했습니다. ".repeat(10));
  await page.getByRole("button", { name: "타임라인에 추가" }).click();
  await expect(page.getByRole("status").filter({ hasText: "주석을 추가했습니다" })).toBeVisible();
  await expectDiagnosticStack(page);

  // Larger text is a layout stress test, not a claim of browser zoom coverage.
  await page.setViewportSize({ width: 1920, height: 720 });
  await page.addStyleTag({ content: ".current-values dt, .current-values dd { font-size: 22px; line-height: 1.8; }" });
  await expect(async () => expectDiagnosticStack(page)).toPass({ timeout: 5_000 });
});

for (const route of ["/overview", "/diagnostics/COATER-02", "/diagnostics/DRYER-02"]) {
  test(`${route} contains text across desktop, tablet and mobile widths`, async ({ page }) => {
    // One case resizes the live chart 15 times; keep the per-check timeout strict.
    test.setTimeout(60_000);
    await page.goto(route);
    await expect(page.getByRole("navigation", { name: "주요 화면" })).toBeVisible();
    if (route.includes("diagnostics")) {
      await expect(page.getByRole("region", { name: "센서 신호 비교", exact: true })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("button", { name: "현장 검증 시작" })).toBeEnabled();
      await page.getByLabel("사용자 역할").selectOption("manager");
    }

    for (const width of viewportWidths) {
      await test.step(`${width}px`, async () => {
        await page.setViewportSize({ width, height: 900 });
        // Chart resize and web-font layout can settle on the following frame.
        await expect(async () => expectContainedLayout(page)).toPass({ timeout: 5_000 });
        const navigation = page.getByRole("navigation", { name: "주요 화면" });
        await expect(navigation.getByText("신호 분석", { exact: true })).toBeVisible();
        await expect(navigation.getByText("전체 공정", { exact: true })).toBeVisible();
        await expect(page.locator(".header-status")).toBeVisible();
        if (route.includes("diagnostics")) {
          await expect(page.getByRole("button", { name: "현장 검증 요청" })).toBeVisible();
        }
      });
    }
  });
}

test("header links stay labelled, keyboard accessible and distinct from status text", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/overview");
  const navigation = page.getByRole("navigation", { name: "주요 화면" });
  const diagnosticsLink = navigation.getByRole("link", { name: "신호 분석", exact: true });
  const overviewLink = navigation.getByRole("link", { name: "전체 공정", exact: true });
  await expect(overviewLink).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".header-context a, .header-context button, .header-status button")).toHaveCount(0);

  await page.getByRole("link", { name: "NEXUS Forge 공정 개요" }).focus();
  await page.keyboard.press("Tab");
  await expect(diagnosticsLink).toBeFocused();
  await expect(diagnosticsLink).toHaveCSS("outline-style", "solid");
  await expect(diagnosticsLink).toHaveCSS("outline-width", "2px");
  await diagnosticsLink.press("Enter");
  await expect(page).toHaveURL(/\/diagnostics\/COATER-02/);
  await expect(diagnosticsLink).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("button", { name: "현장 검증 시작" })).toBeEnabled();
  const processStrip = page.getByRole("region", { name: "공정 단계", exact: true });
  await processStrip.focus();
  await expect(processStrip).toHaveCSS("outline-style", "solid");
  const previousScroll = await processStrip.evaluate((element) => element.scrollLeft);
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => processStrip.evaluate((element) => element.scrollLeft)).toBeGreaterThan(previousScroll);
  await page.getByLabel("사용자 역할").selectOption("manager");
  await page.getByRole("button", { name: "현장 검증 요청" }).click();
  await expect(page.getByRole("dialog", { name: /COATER-02 현장 검증/ })).toBeVisible();
  await expectContainedLayout(page);
});

test("mobile history error and disabled action messages stay inside their containers", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  let releaseHistory!: () => void;
  const pendingHistory = new Promise<void>((resolve) => { releaseHistory = resolve; });
  await page.route("**/api/equipment/COATER-02/history?intervalMs=100", async (route) => {
    await pendingHistory;
    await route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"temporarily_unavailable"}' });
  });
  await page.goto("/diagnostics/COATER-02");
  await expect(page.getByRole("button", { name: "이력 확인 중" })).toBeDisabled();
  await expectContainedLayout(page);
  await expectDiagnosticStack(page);
  releaseHistory();
  await expect(page.getByRole("button", { name: "이력 다시 불러오기" })).toBeVisible();
  await expect(page.getByRole("button", { name: "이력 복구 후 진행" })).toBeDisabled();
  await expectContainedLayout(page);
  await expectDiagnosticStack(page);
});
