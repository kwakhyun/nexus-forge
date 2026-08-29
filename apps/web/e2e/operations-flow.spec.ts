import { expect, test } from "@playwright/test";

test("operator diagnoses an anomaly and issues an on-site verification", async ({ page }) => {
  await page.goto("/overview");

  await expect(page.getByRole("heading", { name: "라인 현황" })).toBeVisible();
  await expect(page.getByText("코터 2호기 웹 장력 이상")).toBeVisible();
  await page.getByRole("button", { name: "신호 진단 열기", exact: true }).click();

  await expect(page).toHaveURL(/\/diagnostics\/COATER-02/);
  await expect(page.getByRole("img", { name: /같은 시간축으로 비교한 그래프/ })).toBeVisible();
  await expect(page.getByText(/개 시점 · Canvas/)).toBeVisible();
  await expect(page.getByLabel("선택 시점 센서값")).toBeVisible();
  await expect(page.getByText("원인 분석 신뢰도")).toBeVisible();
  await expect(page.getByText("데이터 수신 정상")).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: "현장 검증 시작" }).click();
  const dialog = page.getByRole("dialog", { name: /COATER-02 현장 검증/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("checkbox").all().then(async (checkboxes) => {
    for (const checkbox of checkboxes) await checkbox.check();
  });
  await dialog.getByRole("button", { name: "검증 작업 지시 발행" }).click();

  await expect(page.getByTestId("verification-success")).toContainText("현장 검증 작업 지시를 발행했습니다");
  await expect(page.getByTestId("verification-success")).toContainText(/WO-[A-F0-9]{8}/);
});
