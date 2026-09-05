import { expect, test } from "@playwright/test";

test("an operator verifies safety and a manager assigns the verification work order", async ({ page }) => {
  await page.goto("/overview");

  await expect(page.getByRole("heading", { name: "라인 현황" })).toBeVisible();
  await expect(page.getByText("코터 2호기 웹 장력 이상")).toBeVisible();
  await expect(page.getByText("정상 10")).toBeVisible();
  await expect(page.getByText("경고 1")).toBeVisible();
  const dryer = page.getByRole("button", { name: "DRYER-02 이상 신호 진단 열기", exact: true });
  await expect(dryer).toBeVisible();
  await expect(dryer).toContainText("경고");
  await page.getByRole("button", { name: "신호 진단 열기", exact: true }).click();

  await expect(page).toHaveURL(/\/diagnostics\/COATER-02/);
  await expect(page.getByRole("img", { name: /같은 시간축으로 비교한 그래프/ })).toBeVisible();
  await expect(page.locator(".render-stat")).toContainText(/보존 [\d,]+개 시점 \/ 표시 [\d,]+개 · Canvas/);
  await page.getByText("데이터 범위와 요약 방식", { exact: true }).click();
  await expect(page.getByText(/작은 반복 피크나 지속 시간은 이 요약만으로 판단할 수 없습니다/)).toBeVisible();
  await expect(page.getByLabel("이상 발생 시점 센서값")).toBeVisible();
  await expect(page.getByText("원인 분석 신뢰도")).toBeVisible();
  await expect(page.getByText("데이터 수신 정상")).toBeVisible({ timeout: 10_000 });

  const equipmentTree = page.getByRole("complementary", { name: "설비 목록" });
  await equipmentTree.getByLabel("설비 검색").fill("DRYER-02");
  await expect(equipmentTree.getByRole("button", { name: "DRYER-02 신호 진단 열기", exact: true })).toBeVisible();
  await expect(equipmentTree.getByText("COATER-02", { exact: true })).toHaveCount(0);
  await equipmentTree.getByLabel("설비 검색").fill("");
  await equipmentTree.getByRole("button", { name: "설비 상태 필터" }).click();
  await equipmentTree.getByLabel("설비 상태", { exact: true }).selectOption("warning");
  await expect(equipmentTree.getByRole("button", { name: "DRYER-02 신호 진단 열기", exact: true })).toBeVisible();
  await expect(equipmentTree.getByText("COATER-02", { exact: true })).toHaveCount(0);
  await equipmentTree.getByLabel("설비 상태", { exact: true }).selectOption("all");

  await page.getByLabel("경고").uncheck();
  await expect(page.getByText("웹 장력 상승 추세 감지")).toHaveCount(0);
  await expect(page.getByText("비전 검사 결함률 급증")).toBeVisible();
  await page.getByRole("button", { name: /전체 근거 3건 보기/ }).click();
  await expect(page.getByText("비전 검사 엣지 웨이브 결함률")).toBeVisible();

  await page.getByRole("button", { name: "현장 검증 시작" }).click();
  const operatorDialog = page.getByRole("dialog", { name: /COATER-02 현장 검증/ });
  await expect(operatorDialog.getByText("기본 담당자", { exact: true })).toBeVisible();
  await expect(operatorDialog.getByText("설비 보전팀 이민호")).toBeVisible();
  await expect(operatorDialog.getByLabel("작업 담당자")).toHaveCount(0);
  await operatorDialog.getByRole("button", { name: "닫기" }).click();

  await page.getByLabel("사용자 역할").selectOption("manager");
  await page.getByRole("button", { name: "현장 검증 요청" }).click();
  const dialog = page.getByRole("dialog", { name: /COATER-02 현장 검증/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "닫기" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "취소" })).toBeFocused();
  await dialog.getByLabel("작업 담당자").selectOption("공정 기술팀 최유진");
  await dialog.getByRole("checkbox").all().then(async (checkboxes) => {
    for (const checkbox of checkboxes) await checkbox.check();
  });
  await dialog.getByRole("button", { name: "검증 작업 지시 발행" }).click();

  await expect(page.getByTestId("verification-success")).toContainText("현장 검증 작업 지시를 발행했습니다");
  await expect(page.getByTestId("verification-success")).toContainText(/WO-[A-F0-9]{8}/);
  await expect(page.getByTestId("verification-success")).toContainText("공정 기술팀 최유진");
  await expect(page.getByTestId("verification-success")).toContainText("발행됨");
  await expect(page.getByTestId("verification-success")).toContainText("완료 기한");
});

test("blocks diagnosis actions when sensor history fails and recovers after retry", async ({ page }) => {
  let historyUnavailable = true;
  await page.route("**/api/equipment/COATER-02/history?intervalMs=100", async (route) => {
    // Strict Mode can cancel and repeat the initial request. Keep the outage
    // under test control instead of recovering after an assumed request count.
    if (historyUnavailable) {
      await route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"temporarily_unavailable"}' });
      return;
    }
    await route.continue();
  });

  await page.goto("/diagnostics/COATER-02");
  await expect(page.getByRole("region", { name: "센서 신호 비교", exact: true })).toBeVisible({ timeout: 15_000 });

  const historyAlert = page.getByRole("alert").filter({ hasText: "최근 30분 센서 이력을 불러오지 못했습니다" });
  await expect(historyAlert).toBeVisible();
  await expect(page.getByText("분석 보류")).toBeVisible();
  await expect(page.getByRole("button", { name: "이력 복구 후 진행" })).toBeDisabled();

  historyUnavailable = false;
  await historyAlert.getByRole("button", { name: "이력 다시 불러오기" }).click();

  await expect(historyAlert).toHaveCount(0);
  await expect(page.getByText("92%")).toBeVisible();
  await expect(page.getByRole("button", { name: "현장 검증 시작" })).toBeEnabled();
});
