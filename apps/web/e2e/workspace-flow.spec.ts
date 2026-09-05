import { expect, test, type Page } from "@playwright/test";
import axe from "axe-core";

const primary = (page: Page) =>
  page.getByRole("navigation", { name: "제품 탐색", exact: true });
async function readyCase(page: Page) {
  await expect(
    page.getByRole("region", { name: "이상 상세", exact: true }),
  ).toBeVisible({ timeout: 15_000 });
}
async function issueWork(page: Page) {
  await page
    .getByRole("link", { name: "센서 신호와 근거 확인", exact: true })
    .click();
  const start = page.getByRole("button", {
    name: "현장 검증 시작",
    exact: true,
  });
  await expect(start).toBeEnabled({ timeout: 15_000 });
  await start.click();
  const dialog = page.getByRole("dialog");
  for (const checkbox of await dialog.getByRole("checkbox").all())
    await checkbox.check();
  await dialog
    .getByRole("button", { name: "검증 작업 지시 발행", exact: true })
    .click();
  await expect(page.getByTestId("verification-success")).toBeVisible();
}

test("notification to diagnosis, persistent work completion and incident resolution form one journey", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto("/notifications");
  await expect(
    page.getByRole("heading", { name: "COATER-02 이상 발생", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name: "COATER-02 이상 발생", exact: true }) })
    .getByRole("button", { name: "관련 기록 보기", exact: true })
    .click();
  await readyCase(page);
  const detail = page.getByRole("region", { name: "이상 상세", exact: true });
  await expect(
    detail.getByRole("button", { name: "이상 종결", exact: true }),
  ).toBeDisabled();
  await detail.getByRole("button", { name: "이상 확인", exact: true }).click();
  await detail
    .getByRole("combobox", { name: "이상 담당자", exact: true })
    .selectOption("공정 기술팀 최유진");
  await detail
    .getByRole("button", { name: "담당자 저장", exact: true })
    .click();
  await expect(detail.getByRole("status")).toHaveText("담당자를 저장했습니다.");
  await issueWork(page);
  await expect(page.getByTestId("verification-success")).toContainText(
    "공정 기술팀 최유진",
  );
  await page
    .getByRole("link", { name: "정비 관리에서 점검 진행", exact: true })
    .click();
  const work = page.getByRole("region", {
    name: "작업 지시 상세",
    exact: true,
  });
  await expect(work).toBeVisible();
  const workId = await work
    .locator(".detail-kicker > span:first-child")
    .textContent();
  await page.reload();
  await expect(work).toContainText(workId!);
  await work.getByRole("button", { name: "점검 시작", exact: true }).click();
  const complete = work.getByRole("button", {
    name: "점검 완료 기록",
    exact: true,
  });
  await expect(complete).toBeDisabled();
  await work
    .getByLabel("점검 결과", { exact: true })
    .fill("댄서 롤 위치와 장력 편차를 확인하고 점검 결과를 인계했습니다.");
  await work
    .getByRole("checkbox", { name: "점검 결과와 인계 내용을 확인했습니다." })
    .check();
  await complete.click();
  await expect(work.getByRole("status")).toContainText(
    "점검 결과를 저장했습니다",
  );
  await work.getByRole("link", { name: "연결된 이상과 종결 확인" }).click();
  await detail
    .getByLabel("종결 사유", { exact: true })
    .fill("점검 결과와 잔여 위험을 확인하고 이상 처리를 종결했습니다.");
  await detail
    .getByRole("checkbox", { name: "점검 결과와 잔여 위험을 확인했습니다." })
    .check();
  await detail.getByRole("button", { name: "이상 종결", exact: true }).click();
  await expect(
    detail.getByRole("heading", { name: "종결 기록", exact: true }),
  ).toBeVisible();
  await primary(page)
    .getByRole("link", { name: "공정 개요", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "이상 처리를 종결했습니다",
      exact: true,
    }),
  ).toBeVisible();
  await primary(page)
    .getByRole("link", { name: "생산 분석", exact: true })
    .click();
  await expect(
    page
      .locator(".operational-metrics > div")
      .filter({ hasText: "기간 내 이상 종결" }),
  ).toContainText("1건");
  await primary(page).getByRole("link", { name: "알림", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "COATER-02 이상 종결", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "전체 읽음 처리", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("status")).toHaveText("전체 알림을 읽음으로 표시했습니다.");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "전체 읽음 처리", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".nav-count")).toHaveCount(0);
});

test("saved chart range, time zone and notification preferences survive reload", async ({
  page,
}) => {
  await page.goto("/settings");
  await expect(page.getByLabel("실시간 차트 기본 범위")).toBeEnabled();
  await page.getByLabel("실시간 차트 기본 범위").selectOption("5");
  await page.getByLabel("시간 표시", { exact: true }).selectOption("UTC");
  await page.getByRole("checkbox", { name: /작업 지시와 점검 진행/ }).uncheck();
  await page.getByRole("button", { name: "설정 저장", exact: true }).click();
  await expect(page.getByRole("main").getByRole("status")).toContainText(
    "설정을 저장했습니다",
  );
  await page.reload();
  await expect(page.getByLabel("실시간 차트 기본 범위")).toHaveValue("5");
  await expect(page.getByLabel("시간 표시", { exact: true })).toHaveValue(
    "UTC",
  );
  await expect(
    page.getByRole("checkbox", { name: /작업 지시와 점검 진행/ }),
  ).not.toBeChecked();
  // The saved preference is visible before REST history arrives. Keep that
  // boundary deterministic instead of treating a few live points as 5m of history.
  let releaseHistory = () => {};
  const historyGate = new Promise<void>((resolve) => { releaseHistory = resolve; });
  await page.route("**/api/equipment/COATER-02/history*", async (route) => {
    await historyGate;
    await route.continue();
  });
  try {
    await page.getByRole("link", { name: "신호 분석", exact: true }).click();
    await expect(page.getByText("센서 이력을 불러오는 중입니다…", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "전체 구간", exact: true })).toBeDisabled();
    await expect(page.getByLabel("차트 표시 구간")).toContainText("최근 5분, 실시간 갱신");
    await expect(page.getByLabel("차트 표시 구간")).toContainText("UTC");
  } finally {
    releaseHistory();
  }
  await expect(page.getByLabel("이상 발생 시점 센서값")).toBeVisible();
  await expect.poll(async () => {
    const text = await page.getByLabel("차트 표시 구간").textContent();
    const matches = text?.match(/(\d{2}):(\d{2}):(\d{2})–(\d{2}):(\d{2}):(\d{2})/);
    if (!matches) return null;
    const seconds = (offset: number) =>
      Number(matches[offset]) * 3600 +
      Number(matches[offset + 1]) * 60 +
      Number(matches[offset + 2]);
    return (seconds(4) - seconds(1) + 86400) % 86400;
  }).toBe(300);
});

test("concurrent tabs preserve independent incident updates and share read state", async ({
  page,
  context,
}) => {
  await page.goto("/incidents");
  await readyCase(page);
  const other = await context.newPage();
  await other.goto("/incidents");
  await readyCase(other);
  await other
    .getByRole("combobox", { name: "이상 담당자", exact: true })
    .selectOption("코팅 2호 라인 정다은");
  await Promise.all([
    page.getByRole("button", { name: "이상 확인", exact: true }).click(),
    other.getByRole("button", { name: "담당자 저장", exact: true }).click(),
  ]);
  for (const tab of [page, other]) {
    const facts = tab
      .getByRole("region", { name: "이상 상세", exact: true })
      .locator(".detail-facts");
    await expect(facts).toContainText("확인됨");
    await expect(facts).toContainText("코팅 2호 라인 정다은");
  }
  await primary(other).getByRole("link", { name: "알림", exact: true }).click();
  await other
    .getByRole("button", { name: "전체 읽음 처리", exact: true })
    .click();
  await expect(page.locator(".nav-count")).toHaveCount(0);
  await other.close();
});

test("pending verification reload retries the same durable request", async ({
  page,
}) => {
  const requests: unknown[] = [];
  let id = "";
  await page.route("**/api/verifications", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    requests.push(route.request().postDataJSON());
    const response = await route.fetch();
    if (requests.length === 1) {
      id = (await response.json()).id;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: "{}",
      });
    } else await route.fulfill({ response });
  });
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
  await expect(
    dialog.getByRole("button", { name: "같은 요청으로 다시 확인" }),
  ).toBeEnabled();
  await page.reload();
  await page
    .getByRole("button", { name: "미확인 작업 요청 확인", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "같은 요청으로 다시 확인" }),
  ).toBeEnabled();
  await dialog.getByRole("button", { name: "같은 요청으로 다시 확인" }).click();
  await expect(page.getByTestId("verification-success")).toContainText(id);
  expect(requests).toHaveLength(1);
});

test("production errors recover and filtered data can be exported", async ({
  page,
}) => {
  let unavailable = true;
  await page.route("**/api/production", async (route) =>
    unavailable
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: "{}",
        })
      : route.continue(),
  );
  await page.goto("/production");
  await expect(
    page.getByRole("button", { name: "생산 실적 다시 불러오기" }),
  ).toBeVisible();
  unavailable = false;
  await page.getByRole("button", { name: "생산 실적 다시 불러오기" }).click();
  await expect(page.locator(".workspace-table tbody tr")).toHaveCount(24);
  await page
    .getByRole("combobox", { name: "비교 기간", exact: true })
    .selectOption("168");
  await page
    .getByRole("combobox", { name: "생산 라인", exact: true })
    .selectOption("COATING-LINE-02");
  await expect(page.locator(".workspace-table tbody tr")).toHaveCount(7);
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "조회 실적 CSV 내보내기" }).click();
  expect((await downloadEvent).suggestedFilename()).toBe(
    "nexus-forge-production-demo.csv",
  );
});

test("a storage failure is visible and settings never claim an unsaved change succeeded", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = window.indexedDB;
    Object.defineProperty(window, "indexedDB", {
      configurable: true,
      get: () => {
        throw new DOMException("Storage unavailable", "SecurityError");
      },
    });
    window.addEventListener("test:restore-storage", () =>
      Object.defineProperty(window, "indexedDB", {
        configurable: true,
        value: original,
      }),
    );
  });
  await page.goto("/settings");
  await expect(
    page.getByText("저장소 확인이 필요합니다.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "설정 저장", exact: true }),
  ).toBeDisabled();
  await page.evaluate(() =>
    window.dispatchEvent(new Event("test:restore-storage")),
  );
  await page
    .getByRole("button", { name: "저장소 다시 연결", exact: true })
    .click();
  await expect(page.getByLabel("실시간 차트 기본 범위")).toBeEnabled();
  await expect(
    page.getByText("저장소 확인이 필요합니다.", { exact: true }),
  ).toHaveCount(0);
});

test("an aborted work save keeps the request recoverable without reporting success", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (
        this.name === "workspace" &&
        value.pendingVerification === null &&
        value.workOrders?.some((work: { sample: boolean }) => !work.sample) &&
        sessionStorage.getItem("test:quota-injected") !== "yes"
      ) {
        sessionStorage.setItem("test:quota-injected", "yes");
        throw new DOMException("Simulated quota failure", "QuotaExceededError");
      }
      return original.call(this, value, key);
    };
  });
  const requests: unknown[] = [];
  let firstId = "";
  await page.route("**/api/verifications", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    requests.push(route.request().postDataJSON());
    const response = await route.fetch();
    firstId ||= (await response.json()).id;
    await route.fulfill({ response });
  });
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
  await expect(
    dialog.getByText(/발행 결과를 확인하지 못했습니다/),
  ).toBeVisible();
  await expect(page.getByTestId("verification-success")).toHaveCount(0);
  await page.reload();
  await page
    .getByRole("button", { name: "미확인 작업 요청 확인", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "같은 요청으로 다시 확인", exact: true })
    .click();
  await expect(page.getByTestId("verification-success")).toContainText(firstId);
  expect(requests).toHaveLength(1);
  await page
    .getByRole("link", { name: "정비 관리에서 점검 진행", exact: true })
    .click();
  await expect(
    page
      .getByRole("region", { name: "작업 지시 목록", exact: true })
      .getByRole("button"),
  ).toHaveCount(3);
});

test("demo export and confirmed reset preserve unrelated browser data", async ({
  page,
}) => {
  await page.goto("/incidents");
  await readyCase(page);
  await page.getByRole("button", { name: "이상 확인", exact: true }).click();
  await expect(page.getByRole("main").getByRole("status")).toContainText(
    "이상 확인을 기록했습니다",
  );
  await primary(page).getByRole("link", { name: "설정", exact: true }).click();
  await page.getByLabel("실시간 차트 기본 범위").selectOption("5");
  await page.getByRole("button", { name: "설정 저장", exact: true }).click();
  await expect(page.getByRole("main").getByRole("status")).toContainText(
    "설정을 저장했습니다",
  );
  await page.evaluate(() =>
    localStorage.setItem("unrelated-demo-record", "keep"),
  );
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "데모 기록 내보내기", exact: true })
    .click();
  expect((await download).suggestedFilename()).toBe(
    "nexus-forge-demo-records.json",
  );
  await page.locator("summary").filter({ hasText: "데모 기록 초기화" }).click();
  const reset = page.getByRole("button", {
    name: "데모 기록 삭제 및 초기화",
    exact: true,
  });
  await expect(reset).toBeDisabled();
  await page.getByLabel("확인 문구", { exact: true }).fill("초기화");
  await reset.click();
  await expect(
    page.getByText(/이 브라우저의 데모 기록과 설정을 초기화했습니다/),
  ).toBeVisible();
  await expect(page.getByLabel("실시간 차트 기본 범위")).toHaveValue("30");
  expect(
    await page.evaluate(() => localStorage.getItem("unrelated-demo-record")),
  ).toBe("keep");
  await primary(page)
    .getByRole("link", { name: "이상 관리", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "이상 확인", exact: true }),
  ).toBeEnabled();
  await expect(
    page
      .getByRole("region", { name: "이상 상세", exact: true })
      .locator(".detail-facts"),
  ).toContainText("미확인");
});

test("incident and work filters recover from empty results and invalid deep links", async ({
  page,
}) => {
  await page.goto("/incidents");
  await readyCase(page);
  const cases = page.getByRole("region", { name: "이상 목록", exact: true });
  await expect(cases.getByRole("button")).toHaveCount(4);
  await page
    .getByRole("combobox", { name: "처리 상태", exact: true })
    .selectOption("resolved");
  await expect(cases.getByRole("button")).toHaveCount(2);
  await page
    .getByRole("searchbox", { name: "이상 검색", exact: true })
    .fill("존재하지않는설비");
  await expect(
    page.getByRole("heading", {
      name: "조건에 맞는 이상이 없습니다",
      exact: true,
    }),
  ).toBeVisible();
  await cases
    .getByRole("button", { name: "검색 조건 초기화", exact: true })
    .click();
  await expect(cases.getByRole("button")).toHaveCount(4);
  await page.goto("/incidents?incident=missing");
  await expect(
    page.getByRole("heading", {
      name: "요청한 이상 기록을 찾을 수 없습니다",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "이상 상세", exact: true }),
  ).toHaveCount(0);
  await page.goto("/maintenance?work=missing");
  await expect(
    page.getByRole("heading", {
      name: "요청한 작업 기록을 찾을 수 없습니다",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "작업 지시 상세", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "작업 상태", exact: true })
    .selectOption("overdue");
  await expect(
    page.getByRole("heading", {
      name: "조건에 맞는 작업이 없습니다",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "검색 조건 초기화", exact: true })
    .click();
  await expect(
    page
      .getByRole("region", { name: "작업 지시 목록", exact: true })
      .getByRole("button"),
  ).toHaveCount(2);
});

for (const [route, heading] of [
  ["production", "생산 분석"],
  ["incidents", "이상 관리"],
  ["maintenance", "정비 관리"],
  ["notifications", "알림"],
  ["settings", "설정"],
]) {
  test(`${route} has working navigation and no overflow or automated accessibility violations`, async ({
    page,
  }) => {
    test.setTimeout(45_000);
    await page.goto(`/${route}`);
    await expect(
      page.getByRole("heading", { name: heading, exact: true, level: 1 }),
    ).toBeVisible();
    await expect(page).toHaveTitle(`${heading} | NEXUS Forge 공개 데모`);
    await expect(primary(page).getByRole("link")).toHaveCount(6);
    if (route === "production")
      await expect(page.locator(".workspace-table tbody tr")).toHaveCount(24);
    if (route === "incidents") await readyCase(page);
    await page.addScriptTag({ content: axe.source });
    for (const width of [1440, 1024, 700, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      const overflow = await page.evaluate(() => {
        const elements = Array.from(
          document.querySelectorAll<HTMLElement>(".workspace-main *"),
        );
        return {
          page: document.documentElement.scrollWidth - window.innerWidth,
          elements: elements
            .filter(
              (element) =>
                element.clientWidth &&
                !element.matches("svg, svg *, .sr-only") &&
                !["auto", "scroll"].includes(
                  getComputedStyle(element).overflowX,
                ) &&
                element.scrollWidth > element.clientWidth + 1,
            )
            .map((element) => `${element.tagName}.${element.className}`),
        };
      });
      expect(overflow, `${width}px`).toEqual({ page: 0, elements: [] });
      if (width === 1440 || width === 320) {
        const violations = await page.evaluate(async () => {
          const result = await (
            window as unknown as { axe: typeof axe }
          ).axe.run(document, {
            runOnly: {
              type: "tag",
              values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
            },
          });
          return result.violations.map(({ id, nodes }) => ({
            id,
            nodes: nodes.map(({ target, failureSummary }) => ({
              target,
              failureSummary,
            })),
          }));
        });
        expect(violations, `${width}px accessibility`).toEqual([]);
      }
    }
  });
}
