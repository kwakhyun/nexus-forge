import { expect, test } from "@playwright/test";

test("lost issuance survives expired evidence and reload using only a lookup", async ({ page }) => {
  let posts = 0;
  let expired = false;
  let issuedId = "";
  await page.route("**/api/plant/summary", async (route) => {
    const response = await route.fetch();
    const summary = await response.json();
    if (expired) {
      summary.activeIncident.startedAt = Date.now() - 31 * 60_000;
      for (const incident of summary.diagnosticIncidents) incident.startedAt = Date.now() - 31 * 60_000;
    }
    await route.fulfill({ json: summary });
  });
  await page.route("**/api/verifications", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    posts += 1;
    const response = await route.fetch();
    issuedId = (await response.json()).id;
    await route.fulfill({ status: 503, body: "{}", contentType: "application/json" });
  });
  await page.goto("/diagnostics/COATER-02");
  await page.getByRole("button", { name: "현장 검증 시작", exact: true }).click();
  for (const checkbox of await page.getByRole("dialog").getByRole("checkbox").all()) await checkbox.check();
  await page.getByRole("button", { name: "검증 작업 지시 발행", exact: true }).click();
  await expect(page.getByRole("button", { name: "같은 요청으로 다시 확인" })).toBeEnabled();
  expired = true;
  await page.reload();
  await expect(page.getByText("분석 보류", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "미확인 작업 요청 확인", exact: true }).click();
  await page.getByRole("button", { name: "같은 요청으로 다시 확인" }).click();
  await expect(page.getByTestId("verification-success")).toContainText(issuedId);
  expect(posts).toBe(1);
});

test("an unknown issuance can be explicitly retired without reissuing and retains an audit note", async ({ page }) => {
  let posts = 0;
  await page.route("**/api/verifications", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    posts += 1;
    await route.fulfill({ status: 503, body: "{}", contentType: "application/json" });
  });
  await page.route("**/api/verifications/by-request/*", (route) => route.fulfill({ json: { status: "unknown" } }));
  await page.goto("/diagnostics/COATER-02");
  await page.getByRole("button", { name: "현장 검증 시작", exact: true }).click();
  for (const checkbox of await page.getByRole("dialog").getByRole("checkbox").all()) await checkbox.check();
  await page.getByRole("button", { name: "검증 작업 지시 발행", exact: true }).click();
  await page.getByRole("button", { name: "같은 요청으로 다시 확인" }).click();
  const end = page.getByRole("button", { name: "미확정 요청 추적 종료" });
  await expect(end).toBeDisabled();
  await page.getByRole("checkbox", { name: "발행 여부가 미확정이며 작업 취소가 아님을 확인했습니다" }).check();
  await end.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("link", { name: "처리 기록 보기", exact: true }).click();
  await expect(page.getByText(/발행 여부 미확정으로 요청 추적 종료/)).toBeVisible();
  expect(posts).toBe(1);
});

test("five-minute zoom, native series controls and diagnostic context work across routes", async ({ page }) => {
  await page.goto("/settings");
  await page.getByLabel("실시간 차트 기본 범위", { exact: true }).selectOption("5");
  await page.getByRole("button", { name: "설정 저장", exact: true }).click();
  await expect(page.getByRole("main").getByRole("status")).toContainText("설정을 저장했습니다");
  await page.goto("/diagnostics/DRYER-02");
  await expect(page.getByRole("button", { name: "축소", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "축소", exact: true }).click();
  await expect(page.getByLabel("차트 표시 구간")).toContainText("구간 고정");
  await page.getByText("신호 표시와 시점별 값 확인", { exact: true }).click();
  const toggle = page.getByRole("checkbox", { name: "라인 속도", exact: true });
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(toggle).not.toBeChecked();
  const slider = page.getByRole("slider", { name: /조회 시점/ });
  await slider.focus();
  await page.keyboard.press("Home");
  await expect(page.getByRole("button", { name: "이전 시점", exact: true })).toBeDisabled();
  const previousCaption = await page.locator(".signal-point-values caption").textContent();
  await page.keyboard.press("End");
  await expect(page.locator(".signal-point-values caption")).not.toHaveText(previousCaption!);
  await expect(page.getByRole("table")).toContainText("165.0 °C");
  await page.getByRole("link", { name: "정비 관리", exact: true }).click();
  await expect(page.getByText("실시간 수신 대기", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "신호 분석", exact: true }).click();
  await expect(page).toHaveURL(/\/diagnostics\/DRYER-02$/);
});
