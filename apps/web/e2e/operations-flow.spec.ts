import { expect, test } from "@playwright/test";

test("operator diagnoses an anomaly and issues an on-site verification", async ({ page }) => {
  await page.goto("/overview");

  await expect(page.getByRole("heading", { name: "라인 현황" })).toBeVisible();
  await expect(page.getByText("코팅 2호기 장력 이상")).toBeVisible();
  await page.getByRole("button", { name: "신호 진단 열기" }).click();

  await expect(page).toHaveURL(/\/diagnostics\/COATER-02/);
  await expect(page.getByRole("img", { name: /동기화 추세 그래프/ })).toBeVisible();
  await expect(page.getByText(/pts · Canvas/)).toBeVisible();
  await expect(page.getByText("스트림 정상")).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: "원인 검증 시작" }).click();
  const dialog = page.getByRole("dialog", { name: /COATER-02 원인 검증/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("checkbox").all().then(async (checkboxes) => {
    for (const checkbox of checkboxes) await checkbox.check();
  });
  await dialog.getByRole("button", { name: "현장 확인 요청" }).click();

  await expect(page.getByTestId("verification-success")).toContainText("현장 확인 요청이 발행되었습니다");
  await expect(page.getByTestId("verification-success")).toContainText(/WO-[A-F0-9]{8}/);
});
