import { expect, test, type Page, type BrowserContext } from "@playwright/test";
import axe from "axe-core";
import { VERIFICATION_CHECKLIST, diagnosticIncidents, type PlantSummary } from "@nexus/contracts";
import {
  applyWorkspaceCommand,
  emptyWorkspace,
  isWorkspaceDocument,
} from "../src/domain/workspace";

const navigation = (page: Page) =>
  page.getByRole("navigation", { name: "제품 탐색", exact: true });
const runtimeErrors = new WeakMap<BrowserContext, string[]>();
test.beforeEach(({ context }) => {
  const errors: string[] = [];
  runtimeErrors.set(context, errors);
  const listen = (page: Page) =>
    page.on("pageerror", (error) => errors.push(error.message));
  context.pages().forEach(listen);
  context.on("page", listen);
});
test.afterEach(async ({ page, context }) => {
  expect(runtimeErrors.get(context)).toEqual([]);
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
});

test("changing incident status keeps the selected detail and success visible under a status filter", async ({
  page,
}) => {
  await page.goto("/incidents");
  const detail = page.getByRole("region", { name: "이상 상세", exact: true });
  await expect(detail).toBeVisible();
  await page
    .getByRole("combobox", { name: "처리 상태", exact: true })
    .selectOption("open");
  await detail.getByRole("button", { name: "이상 확인", exact: true }).click();
  await expect(detail).toBeVisible();
  await expect(detail.getByRole("status")).toContainText(
    "이상 확인을 기록했습니다",
  );
  await expect(detail).toContainText(
    "선택한 이상은 현재 검색 조건에 포함되지 않습니다",
  );
  await expect(
    detail.getByRole("combobox", { name: "이상 담당자", exact: true }),
  ).toBeEnabled();
});

test("mobile list selection brings the chosen detail and keyboard focus into view", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 667 });
  await page.goto("/incidents");
  const list = page.getByRole("region", { name: "이상 목록", exact: true });
  await expect(list.getByRole("button")).toHaveCount(4);
  await list.getByRole("button").last().click();
  const detail = page.getByRole("region", { name: "이상 상세", exact: true });
  await expect(detail.getByRole("heading", { level: 2 })).toBeFocused();
  await expect(detail.getByRole("heading", { level: 2 })).toBeInViewport();
  await detail
    .getByRole("button", { name: "목록으로 돌아가기", exact: true })
    .click();
  await expect(list.getByRole("heading", { level: 2 })).toBeFocused();
  await expect(list.getByRole("heading", { level: 2 })).toBeInViewport();
  const visibleTop = await list
    .getByRole("heading", { level: 2 })
    .evaluate((element) => ({
      top: element.getBoundingClientRect().top,
      headerBottom: document
        .querySelector(".app-header")!
        .getBoundingClientRect().bottom,
    }));
  expect(visibleTop.top).toBeGreaterThanOrEqual(visibleTop.headerBottom);
});

test("same-field settings conflicts keep the draft and require an explicit reset", async ({
  page,
  context,
}) => {
  await page.goto("/settings");
  await expect(page.getByLabel("실시간 차트 기본 범위")).toBeEnabled();
  await page.getByLabel("실시간 차트 기본 범위").selectOption("15");
  const other = await context.newPage();
  await other.goto("/settings");
  await expect(other.getByLabel("실시간 차트 기본 범위")).toBeEnabled();
  await other.getByLabel("실시간 차트 기본 범위").selectOption("5");
  await other.getByRole("button", { name: "설정 저장", exact: true }).click();
  await expect(other.getByRole("main").getByRole("status")).toContainText(
    "설정을 저장했습니다",
  );
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "다른 탭에서 편집 중인 설정이 변경되었습니다",
  );
  await expect(page.getByLabel("실시간 차트 기본 범위")).toHaveValue("15");
  await expect(
    page.getByRole("button", { name: "설정 저장", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "저장된 설정으로 되돌리기", exact: true })
    .click();
  await expect(page.getByLabel("실시간 차트 기본 범위")).toHaveValue("5");
  await expect(page.getByLabel("실시간 차트 기본 범위")).toBeFocused();
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
});

async function assertContained(page: Page) {
  const bounds = await page.evaluate(() => {
    const ignored = "svg, svg *, input, textarea, select, option, .sr-only";
    const all = [
      ...document.querySelectorAll<HTMLElement>(".workspace-main *"),
    ].filter((element) => element.clientWidth > 0 && !element.matches(ignored));
    const overflowing = all.filter(
      (element) =>
        !["auto", "scroll"].includes(getComputedStyle(element).overflowX) &&
        element.scrollWidth > element.clientWidth + 2,
    );
    const clipped = all.filter(
      (element) =>
        ["hidden", "clip"].includes(getComputedStyle(element).overflowY) &&
        element.scrollHeight > element.clientHeight + 2,
    );
    const panels = [
      ...document.querySelectorAll<HTMLElement>(
        ".workspace-panel, .workspace-metrics > div, .notification-list > li, .workspace-scope, .workspace-draft-notice, .workspace-draft-summary, .workspace-draft-list > li",
      ),
    ];
    const escaped = panels.flatMap((panel) => {
      const edge = panel.getBoundingClientRect();
      return [
        ...panel.querySelectorAll<HTMLElement>(
          "h1,h2,h3,p,form,button,time,textarea",
        ),
      ]
        .filter((element) => {
          if (!element.clientWidth || element.closest("details:not([open])"))
            return false;
          const rect = element.getBoundingClientRect();
          return rect.bottom > edge.bottom + 2 || rect.top < edge.top - 2;
        })
        .map(
          (element) =>
            `${panel.className}: ${element.tagName}.${element.className}`,
        );
    });
    return {
      page: document.documentElement.scrollWidth - window.innerWidth,
      overflowing: overflowing.map(
        (node) => `${node.tagName}.${node.className}`,
      ),
      clipped: clipped.map((node) => `${node.tagName}.${node.className}`),
      escaped,
    };
  });
  expect(bounds).toEqual({
    page: 0,
    overflowing: [],
    clipped: [],
    escaped: [],
  });
}

test("mobile work completion preserves a long draft and filtered details through incident resolution", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/diagnostics/COATER-02");
  await page
    .getByRole("button", { name: "현장 검증 시작", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  for (const checkbox of await dialog.getByRole("checkbox").all())
    await checkbox.check();
  await dialog
    .getByRole("button", { name: "검증 작업 지시 발행", exact: true })
    .click();
  await expect(page.getByTestId("verification-success")).toBeVisible();
  await page
    .getByRole("link", { name: "정비 관리에서 점검 진행", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "작업 상태", exact: true })
    .selectOption("issued");
  const work = page.getByRole("region", {
    name: "작업 지시 상세",
    exact: true,
  });
  await work.getByRole("button", { name: "점검 시작", exact: true }).click();
  await expect(work.getByRole("status")).toContainText(
    "점검 시작을 기록했습니다",
  );
  await expect(work).toContainText(
    "선택한 작업은 현재 검색 조건에 포함되지 않습니다",
  );
  const note = (
    "장력 편차와 점검 인계 내용을 확인했습니다.\n" +
    "LONG-UNBROKEN-EQUIPMENT-REFERENCE".repeat(18)
  ).slice(0, 500);
  await work
    .getByRole("textbox", { name: "점검 결과", exact: true })
    .fill(note);
  await work.getByRole("checkbox").check();
  await navigation(page)
    .getByRole("link", { name: "알림", exact: true })
    .click();
  await navigation(page)
    .getByRole("link", { name: "정비 관리", exact: true })
    .click();
  await expect(
    work.getByRole("textbox", { name: "점검 결과", exact: true }),
  ).toHaveValue(note);
  await expect(work.getByRole("checkbox")).toBeChecked();
  await page
    .getByRole("combobox", { name: "작업 상태", exact: true })
    .selectOption("in_progress");
  await assertContained(page);
  await work
    .getByRole("button", { name: "점검 완료 기록", exact: true })
    .click();
  await expect(work.getByRole("status")).toContainText(
    "점검 결과를 저장했습니다",
  );
  await expect(work.locator(".resolution-note")).toContainText(note);
  await assertContained(page);
  await work.getByRole("link", { name: "연결된 이상과 종결 확인" }).click();
  const detail = page.getByRole("region", { name: "이상 상세", exact: true });
  await page
    .getByRole("combobox", { name: "처리 상태", exact: true })
    .selectOption("in_progress");
  await detail
    .getByRole("textbox", { name: "종결 사유", exact: true })
    .fill(note);
  await detail.getByRole("checkbox").check();
  await navigation(page)
    .getByRole("link", { name: "생산 분석", exact: true })
    .click();
  await navigation(page)
    .getByRole("link", { name: "이상 관리", exact: true })
    .click();
  await expect(
    detail.getByRole("textbox", { name: "종결 사유", exact: true }),
  ).toHaveValue(note);
  await expect(detail.getByRole("checkbox")).toBeChecked();
  await page
    .getByRole("combobox", { name: "처리 상태", exact: true })
    .selectOption("in_progress");
  await detail.getByRole("button", { name: "이상 종결", exact: true }).click();
  await expect(
    detail.getByRole("heading", { name: "종결 기록", exact: true }),
  ).toBeVisible();
  await expect(detail).toContainText(
    "선택한 이상은 현재 검색 조건에 포함되지 않습니다",
  );
  await assertContained(page);
  await page.reload();
  await expect(detail.locator(".resolution-note")).toContainText(note);
});

test("reading the final unread notification keeps keyboard focus on meaningful feedback", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/notifications");
  await expect(
    page.getByRole("button", { name: "읽음으로 표시", exact: true }),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "읽지 않음", exact: true }).click();
  await page.getByRole("button", { name: "읽음으로 표시", exact: true }).first().click();
  const read = page.getByRole("button", { name: "읽음으로 표시", exact: true });
  await expect(read).toHaveCount(1);
  await read.focus();
  await page.keyboard.press("Enter");
  const feedback = page.getByRole("main").getByRole("status");
  await expect(feedback).toContainText("읽음으로 표시했습니다");
  await expect(feedback).toBeFocused();
  await expect(
    page.getByRole("heading", {
      name: "읽지 않은 알림이 없습니다",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "알림 필터 초기화", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "관련 기록 보기", exact: true }),
  ).toHaveCount(2);
});

test("another tab completing a work order cannot erase this tab's unsubmitted result", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/diagnostics/COATER-02");
  await page
    .getByRole("button", { name: "현장 검증 시작", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  for (const checkbox of await dialog.getByRole("checkbox").all())
    await checkbox.check();
  await dialog
    .getByRole("button", { name: "검증 작업 지시 발행", exact: true })
    .click();
  await expect(page.getByTestId("verification-success")).toBeVisible();
  await page
    .getByRole("link", { name: "정비 관리에서 점검 진행", exact: true })
    .click();
  const work = page.getByRole("region", {
    name: "작업 지시 상세",
    exact: true,
  });
  await work.getByRole("button", { name: "점검 시작", exact: true }).click();
  const draft =
    "이 탭에서 아직 제출하지 않은 점검 결과입니다.\n" +
    "UNBROKEN-REFERENCE".repeat(20);
  const saved = "다른 탭에서 점검을 마치고 인계 내용을 확인했습니다.";
  await work
    .getByRole("textbox", { name: "점검 결과", exact: true })
    .fill(draft);
  const other = await context.newPage();
  await other.goto(page.url());
  const otherWork = other.getByRole("region", {
    name: "작업 지시 상세",
    exact: true,
  });
  await otherWork
    .getByRole("textbox", { name: "점검 결과", exact: true })
    .fill(saved);
  await otherWork.getByRole("checkbox").check();
  await otherWork
    .getByRole("button", { name: "점검 완료 기록", exact: true })
    .click();
  await expect(otherWork.locator(".resolution-note")).toContainText(saved);
  await expect(work.locator(".resolution-note")).toContainText(saved);
  await expect(
    work
      .getByRole("status")
      .filter({ hasText: "다른 탭에서 점검을 완료했습니다" }),
  ).toBeVisible();
  await page.locator(".workspace-draft-summary > summary").click();
  const preserved = page.getByRole("textbox", {
    name: "보관 중인 점검 결과",
    exact: true,
  });
  await expect(preserved).toHaveValue(draft);
  await expect(preserved).toHaveAttribute("readonly", "");
  await assertContained(page);
  await page
    .getByRole("link", { name: "해당 기록으로 이동", exact: true })
    .click();
  await expect(work.getByRole("heading", { level: 2 })).toBeFocused();
  await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(async () =>
    (
      await (window as unknown as { axe: typeof axe }).axe.run(document, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
        },
      })
    ).violations.map(({ id }) => id),
  );
  expect(violations).toEqual([]);
  await page
    .getByRole("button", { name: "이 입력 지우기", exact: true })
    .click();
  await expect(page.locator(".workspace-draft-summary")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "정비 관리", exact: true }),
  ).toBeFocused();
  await page.reload();
  await expect(work.locator(".resolution-note")).toContainText(saved);
});

test("partial or absent production data never appears as a measured zero or valid comparison", async ({
  page,
}) => {
  await page.route("**/api/production", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.runs = data.runs.filter(
      (run: { lineId: string }) => run.lineId === "COATING-LINE-01",
    );
    await route.fulfill({ response, json: data });
  });
  await page.goto("/production");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "선택 기간의 자료가 일부 누락",
  );
  await expect(page.locator(".production-metrics")).not.toContainText(
    "이전 기간 대비",
  );
  await page
    .getByRole("combobox", { name: "생산 라인", exact: true })
    .selectOption("COATING-LINE-02");
  await expect(
    page.getByRole("heading", {
      name: "선택한 기간과 라인의 생산 실적이 없습니다",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".production-metrics")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "조회 실적 CSV 내보내기", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("combobox", { name: "생산 라인", exact: true })
    .selectOption("COATING-LINE-01");
  await expect(page.locator(".workspace-table tbody tr")).toHaveCount(24);
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
});

async function seedLongRecords(page: Page) {
  const summary = (await (
    await page.request.get("/api/plant/summary")
  ).json()) as PlantSummary;
  const workspace = diagnosticIncidents(summary).slice().reverse().reduce(
    (state, incident) => applyWorkspaceCommand(state, { type: "seed", incident }),
    emptyWorkspace(),
  );
  const now = Date.now();
  const longNote = (
    "점검 결과와 잔여 위험을 확인한 기록입니다.\n" +
    "REFERENCE-WITHOUT-WHITESPACE-".repeat(20)
  ).slice(0, 500);
  const active = workspace.cases.find((item) => !item.sample)!;
  active.title = "장력과 온도 신호를 함께 확인한 장시간 점검 이력 "
    .repeat(9)
    .slice(0, 200);
  active.status = "resolved";
  active.resolvedAt = now;
  active.resolution = longNote;
  active.assignee = "설비 보전팀 이민호";
  active.activity = Array.from({ length: 100 }, (_, index) => ({
    id: `activity-${index}`,
    at: now - (100 - index) * 1000,
    actor: "데모 작업자",
    message: longNote,
  }));
  for (let index = 0; index < 98; index++)
    workspace.workOrders.unshift({
      id: `WO-${index}-` + "REFERENCE".repeat(7),
      incidentId: active.id,
      equipmentId: active.equipmentId,
      title: active.title,
      status: "completed",
      issuedAt: now - 120_000,
      dueAt: now + 30_000,
      startedAt: now - 60_000,
      completedAt: now - 30_000,
      completionNote: longNote,
      requestedBy: "교대 관리자 박서진",
      assignee: "설비 보전팀 이민호",
      checks: [...VERIFICATION_CHECKLIST],
      sample: false,
      activity: index === 97 ? active.activity : [],
    });
  workspace.notifications = Array.from({ length: 200 }, (_, index) => ({
    id: `notification-${index}`,
    kind: index % 2 ? "work" : "incident",
    title: active.title,
    detail: longNote,
    createdAt: now - index * 1000,
    readAt: null,
    caseId: active.id,
    workOrderId: index % 2 ? workspace.workOrders[0]!.id : null,
  }));
  workspace.revision = 100;
  expect(isWorkspaceDocument(workspace)).toBe(true);
  await page.addInitScript((value) => {
    // The fixture is limited to this test browser's origin and is never an application import path.
    const request = indexedDB.open("nexus-forge-workspace", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("workspace");
    };
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("workspace", "readwrite");
      transaction.objectStore("workspace").put(value, "current");
      transaction.oncomplete = () => database.close();
    };
  }, workspace);
}

for (const route of [
  "production",
  "incidents",
  "maintenance",
  "notifications",
  "settings",
]) {
  test(`${route} remains contained and reachable with long records, short screens and enlarged text`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await seedLongRecords(page);
    await page.goto(`/${route}`);
    await expect(page.locator(".nav-count")).toHaveText("99+");
    await expect(
      navigation(page).getByRole("link", { name: "알림", exact: true }),
    ).toHaveAccessibleDescription("읽지 않은 알림 200건");
    if (route === "production")
      await expect(page.locator(".workspace-table tbody tr")).toHaveCount(24);
    if (route === "incidents")
      await expect(page.locator(".activity-panel li")).toHaveCount(100);
    if (route === "maintenance")
      await expect(page.locator(".operation-list li")).toHaveCount(100);
    if (route === "notifications")
      await expect(page.locator(".notification-list li")).toHaveCount(200);
    if (route === "settings")
      await page
        .locator("summary")
        .filter({ hasText: "데모 기록 초기화" })
        .click();
    await page.addScriptTag({ content: axe.source });
    for (const viewport of [
      { width: 1440, height: 600 },
      { width: 1280, height: 560 },
      { width: 1024, height: 600 },
      { width: 700, height: 667 },
      { width: 390, height: 667 },
      { width: 390, height: 844 },
      { width: 320, height: 568 },
    ]) {
      await page.setViewportSize(viewport);
      await assertContained(page);
    }
    await page.addStyleTag({
      content:
        ".workspace-main :is(p,small,label,button,input,select,textarea,span,time,dt,dd,a,summary) { font-size:22px !important; line-height:1.6 !important; }",
    });
    await assertContained(page);
    const last = page
      .locator(".workspace-main")
      .locator(
        "button:not(:disabled), a, .activity-panel li, .workspace-table tr",
      )
      .last();
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
    const violations = await page.evaluate(async () =>
      (
        await (window as unknown as { axe: typeof axe }).axe.run(document, {
          runOnly: {
            type: "tag",
            values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
          },
        })
      ).violations.map(({ id, nodes }) => ({
        id,
        targets: nodes.map((node) => node.target),
      })),
    );
    expect(violations).toEqual([]);
  });
}

test("unsaved settings survive in-app navigation and independent edits in another tab", async ({
  page,
  context,
}) => {
  await page.goto("/settings");
  await expect(page.getByLabel("실시간 차트 기본 범위")).toBeEnabled();
  await page.getByLabel("실시간 차트 기본 범위").selectOption("5");
  await navigation(page)
    .getByRole("link", { name: "알림", exact: true })
    .click();
  await navigation(page)
    .getByRole("link", { name: "설정", exact: true })
    .click();
  await expect(page.getByLabel("실시간 차트 기본 범위")).toHaveValue("5");
  const other = await context.newPage();
  await other.goto("/settings");
  await expect(other.getByLabel("시간 표시", { exact: true })).toBeEnabled();
  await other.getByLabel("시간 표시", { exact: true }).selectOption("UTC");
  await other.getByRole("button", { name: "설정 저장", exact: true }).click();
  await expect(other.getByRole("main").getByRole("status")).toContainText(
    "설정을 저장했습니다",
  );
  await expect(page.getByLabel("실시간 차트 기본 범위")).toHaveValue("5");
  await expect(page.getByLabel("시간 표시", { exact: true })).toHaveValue(
    "UTC",
  );
  await page.getByRole("button", { name: "설정 저장", exact: true }).click();
  await expect(page.getByRole("main").getByRole("status")).toContainText(
    "설정을 저장했습니다",
  );
  await page.reload();
  await expect(page.getByLabel("실시간 차트 기본 범위")).toHaveValue("5");
  await expect(page.getByLabel("시간 표시", { exact: true })).toHaveValue(
    "UTC",
  );
});

test("storage failure is not presented as a perpetual loading state or zero records", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "indexedDB", {
      configurable: true,
      get: () => {
        throw new DOMException("Unavailable", "SecurityError");
      },
    }),
  );
  await page.goto("/incidents");
  await expect(
    page.getByText("저장소 확인이 필요합니다.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "저장 기록을 확인할 수 없습니다",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("운영 기록을 준비하고 있습니다", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".workspace-metrics strong").first()).toHaveText(
    "—",
  );
  for (const route of ["incidents", "maintenance", "notifications"]) {
    await page.goto(`/${route}`);
    await expect(page.locator(".filter-count")).toContainText("건수 미확인");
    await expect(page.locator(".filter-count")).not.toContainText("0건");
  }
});
