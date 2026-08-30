import { expect, test } from "@playwright/test";

test("an operator verifies safety and a manager assigns the verification work order", async ({ page }) => {
  await page.goto("/overview");

  await expect(page.getByRole("heading", { name: "라인 현황" })).toBeVisible();
  await expect(page.getByText("코터 2호기 웹 장력 이상")).toBeVisible();
  await expect(page.getByText("정상 10")).toBeVisible();
  await expect(page.getByText("경고 1")).toBeVisible();
  await expect(page.getByLabel("DRYER-02 경고")).toBeVisible();
  await page.getByRole("button", { name: "신호 진단 열기", exact: true }).click();

  await expect(page).toHaveURL(/\/diagnostics\/COATER-02/);
  await expect(page.getByRole("img", { name: /같은 시간축으로 비교한 그래프/ })).toBeVisible();
  await expect(page.getByText(/개 시점 · Canvas/)).toBeVisible();
  await expect(page.getByLabel("선택 시점 센서값")).toBeVisible();
  await expect(page.getByText("원인 분석 신뢰도")).toBeVisible();
  await expect(page.getByText("데이터 수신 정상")).toBeVisible({ timeout: 10_000 });

  const equipmentTree = page.getByRole("complementary", { name: "설비 목록" });
  await equipmentTree.getByLabel("설비 검색").fill("DRYER-02");
  await expect(equipmentTree.getByText("DRYER-02")).toBeVisible();
  await expect(equipmentTree.getByText("COATER-02")).toHaveCount(0);
  await equipmentTree.getByLabel("설비 검색").fill("");
  await equipmentTree.getByRole("button", { name: "설비 상태 필터" }).click();
  await equipmentTree.getByLabel("설비 상태", { exact: true }).selectOption("warning");
  await expect(equipmentTree.getByText("DRYER-02")).toBeVisible();
  await expect(equipmentTree.getByText("COATER-02")).toHaveCount(0);
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
