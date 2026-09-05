import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ timeout: 60_000 });

async function expectEquipmentReady(page: Page, equipmentId: "COATER-02" | "DRYER-02") {
  // Lazy module loading and history delivery are separate from the initial route shell.
  await expect(page).toHaveURL(new RegExp(`/diagnostics/${equipmentId}(?:[?#].*)?$`));
  await expect(page.getByRole("heading", { name: equipmentId, exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel("이상 발생 시점 센서값", { exact: true })).toContainText(
    equipmentId === "DRYER-02" ? "설정값 165.0 °C" : "설정값 160.0 °C",
    { timeout: 15_000 },
  );
}

test("switches actual history and WebSocket subscription while reusing the diagnostic screen", async ({ page }) => {
  const frames: Array<{ equipmentId?: string }> = [];
  page.on("websocket", (socket) => socket.on("framereceived", ({ payload }) => {
    const frame = JSON.parse(String(payload));
    if (frame.type === "sensor.point") frames.push(frame);
  }));
  await page.goto("/overview");
  await page.getByRole("button", { name: "DRYER-02 이상 신호 진단 열기" }).click();
  await expectEquipmentReady(page, "DRYER-02");
  await expect(page.getByRole("heading", { name: "DRYER-02", exact: true })).toBeVisible();
  await expect(page).toHaveTitle("DRYER-02 신호 분석 | NEXUS Forge 공개 데모");
  await expect(page.getByLabel("이상 발생 시점 센서값")).toContainText("설정값 165.0 °C");
  await expect(page.getByLabel("이상 발생 시점 센서값")).not.toContainText("웹 장력");
  await expect(page.getByRole("button", { name: "현장 검증 시작", exact: true })).toBeEnabled();
  await expect.poll(() => frames.some((frame) => frame.equipmentId === "DRYER-02")).toBe(true);

  const tree = page.getByRole("complementary", { name: "설비 목록", exact: true });
  await tree.getByRole("button", { name: "COATER-02 신호 진단 열기", exact: true }).click();
  await expectEquipmentReady(page, "COATER-02");
  await expect(page.getByRole("heading", { name: "COATER-02", exact: true })).toBeVisible();
  await expect(page).toHaveTitle("COATER-02 신호 분석 | NEXUS Forge 공개 데모");
  await expect(page.getByLabel("이상 발생 시점 센서값")).toContainText("설정값 160.0 °C");
  await expect(page.getByLabel("이상 발생 시점 센서값")).toContainText(" 웹 장력 ");
  await expect.poll(() => frames.at(-1)?.equipmentId).toBe("COATER-02");
  await tree.getByRole("button", { name: "DRYER-02 신호 진단 열기", exact: true }).click();
  await expectEquipmentReady(page, "DRYER-02");
  await expect(page.getByLabel("이상 발생 시점 센서값")).toContainText("설정값 165.0 °C");
  await expect.poll(() => frames.at(-1)?.equipmentId).toBe("DRYER-02");
  await page.reload();
  await expectEquipmentReady(page, "DRYER-02");
  await expect(page.getByLabel("이상 발생 시점 센서값")).toContainText("설정값 165.0 °C");
});

test("issues a dryer-specific work order and restores the matching result after switching equipment", async ({ page }) => {
  await page.goto("/diagnostics/DRYER-02");
  await expectEquipmentReady(page, "DRYER-02");
  const start = page.getByRole("button", { name: "현장 검증 시작", exact: true });
  await expect(start).toBeEnabled();
  await start.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("고온부와 건조로 내부에 접근하지 않는 외부 계기 점검");
  await expect(dialog).not.toContainText("댄서 롤 안전 가드");
  for (const checkbox of await dialog.getByRole("checkbox").all()) await checkbox.check();
  const issuance = page.waitForResponse((response) => response.url().endsWith("/api/verifications") && response.request().method() === "POST");
  await dialog.getByRole("button", { name: "검증 작업 지시 발행", exact: true }).click();
  const record = await (await issuance).json();
  expect(record.incidentId).toBe("INC-20260831-DRYER-02");
  await expect(page.getByTestId("verification-success")).toContainText(record.id);
  await dialog.getByRole("button", { name: "진단 화면으로 돌아가기", exact: true }).click();
  await page.getByRole("complementary", { name: "설비 목록", exact: true }).getByRole("button", { name: "COATER-02 신호 진단 열기", exact: true }).click();
  await expectEquipmentReady(page, "COATER-02");
  await expect(page.getByRole("button", { name: "현장 검증 시작", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "발행한 작업 지시 보기", exact: true })).toHaveCount(0);
  await page.getByRole("complementary", { name: "설비 목록", exact: true }).getByRole("button", { name: "DRYER-02 신호 진단 열기", exact: true }).click();
  await page.getByRole("button", { name: "발행한 작업 지시 보기", exact: true }).click();
  await expect(page.getByTestId("verification-success")).toContainText(record.id);
  await dialog.getByRole("link", { name: "정비 관리에서 점검 진행", exact: true }).click();
  await expect(page.getByRole("heading", { name: "DRYER-02 현장 검증", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "점검 시작", exact: true }).click();
  await page.getByRole("textbox", { name: "점검 결과", exact: true }).fill("건조로 외부 계기의 온도 표시를 비교하고 편차 관찰 결과를 인계했습니다.");
  await page.getByRole("checkbox", { name: "점검 결과와 인계 내용을 확인했습니다.", exact: true }).check();
  await page.getByRole("button", { name: "점검 완료 기록", exact: true }).click();
  await expect(page.getByText("건조로 외부 계기의 온도 표시를 비교하고 편차 관찰 결과를 인계했습니다.", { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "DRYER-02 현장 검증", exact: true })).toBeVisible();
  await expect(page.getByText("건조로 외부 계기의 온도 표시를 비교하고 편차 관찰 결과를 인계했습니다.", { exact: true }).first()).toBeVisible();
});

test("a pending dryer request cannot be overwritten by a coater request", async ({ page }) => {
  const requests: unknown[] = [];
  await page.route("**/api/verifications", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    requests.push(route.request().postDataJSON());
    const response = await route.fetch();
    if (requests.length === 1) await route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
    else await route.fulfill({ response });
  });
  await page.goto("/diagnostics/DRYER-02");
  await expectEquipmentReady(page, "DRYER-02");
  await page.getByRole("button", { name: "현장 검증 시작", exact: true }).click();
  const dialog = page.getByRole("dialog");
  for (const checkbox of await dialog.getByRole("checkbox").all()) await checkbox.check();
  await dialog.getByRole("button", { name: "검증 작업 지시 발행", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "같은 요청으로 다시 확인", exact: true })).toBeEnabled();
  await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: "COATER-02 신호 진단 열기", exact: true }).click();
  await expectEquipmentReady(page, "COATER-02");
  await page.getByRole("button", { name: "현장 검증 시작", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("다른 설비의 작업 요청 결과를 먼저 확인해야 합니다");
  for (const checkbox of await dialog.getByRole("checkbox").all()) await checkbox.check();
  await expect(dialog.getByRole("button", { name: "검증 작업 지시 발행", exact: true })).toBeDisabled();
  expect(requests).toHaveLength(1);
  await dialog.getByRole("link", { name: "해당 설비의 요청 확인", exact: true }).click();
  await expectEquipmentReady(page, "DRYER-02");
  await page.getByRole("button", { name: "미확인 작업 요청 확인", exact: true }).click();
  await dialog.getByRole("button", { name: "같은 요청으로 다시 확인", exact: true }).click();
  await expect(page.getByTestId("verification-success")).toBeVisible();
  expect(requests).toHaveLength(1);
});
