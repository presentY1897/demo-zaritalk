import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type Browser,
  type Page,
} from "@playwright/test";
import { queryTestDb } from "./db";

/**
 * T6.1 · T6.2 통합(E2E).
 *
 * - **E2E①**: 브라우저 컨텍스트 2개에서 각자 변형이 고정되는가(T6.1 문서가 요구한 통합 테스트).
 * - **E2E②**: `?variant=` 미리보기가 배정을 바꾸지 않고, 어드민 지표·퍼널 API 가 그 이벤트를
 *   세지 않는가 + 대시보드 집계가 실데이터로 나오는가(T6.2).
 *
 * ## 어드민을 화면이 아니라 web API 로 친 이유 (T2.5 와 같은 판단)
 *
 * 어드민은 **별도 앱(3001)** 이고 `playwright.config.ts` 의 `webServer` 는 web 하나만 띄운다 —
 * 그 설정 파일은 이 task 소유가 아니라 손대지 않았다. 게다가 어드민 대시보드는 집계 규칙을
 * 하나도 들고 있지 않고(응답을 그대로 그린다) **위험이 전부 web API 쪽에 있다.**
 * 화면 렌더링은 `pnpm build` 와 타입체크가 지킨다.
 * 심사 스펙과 같은 이유로 요청은 **어드민 세션 쿠키**로 보낸다 — 검증되는 것이 본선 경로
 * (`User.isAdmin` 판정)다. 시크릿 경로는 단위 테스트가 따로 지킨다.
 */

/** 시드에 들어 있는 공개 고지서 토큰 */
const SEED_TOKEN = "demo-notice-hong";
const EXPERIMENT = "notice_cta";

/** 실험에 쓸 후보 anonId — 32자 hex 형식이어야 proxy 가 덮어쓰지 않는다 */
function candidateAnonId(index: number): string {
  return `e2eab${String(index).padStart(3, "0")}`.padEnd(32, "0").slice(0, 32);
}

async function assignmentOf(anonId: string): Promise<{ variant: string; userId: string | null }[]> {
  return queryTestDb<{ variant: string; userId: string | null }>(
    'SELECT variant, "userId" FROM "AbAssignment" WHERE "anonId" = $1 AND "experimentKey" = $2',
    [anonId, EXPERIMENT],
  );
}

/** 화면에 실제로 그려진 변형 — 하단 CTA 카드의 `data-variant` */
async function renderedVariant(page: Page): Promise<string> {
  const card = page.locator('[aria-labelledby="notice-cta-headline"]');
  await expect(card).toBeVisible();
  return (await card.getAttribute("data-variant")) ?? "";
}

/** anonId 쿠키를 미리 심은 브라우저 컨텍스트 — "다른 브라우저" 를 흉내낸다 */
async function openVisitor(browser: Browser, baseURL: string, anonId: string) {
  const context = await browser.newContext();
  await context.addCookies([{ name: "zari_anon", value: anonId, url: baseURL }]);
  return context;
}

/** 시드 관리자 계정으로 세션을 한 줄 만들어 어드민 API 컨텍스트를 연다 (T2.5 와 같은 방식) */
async function openAdminApi(baseURL: string): Promise<{ api: APIRequestContext; token: string }> {
  const admins = await queryTestDb<{ id: string }>(
    'SELECT id FROM "User" WHERE "isAdmin" = true ORDER BY "createdAt" ASC LIMIT 1',
  );
  const adminId = admins[0]?.id;
  expect(adminId, "시드에 관리자 계정(isAdmin)이 있어야 한다").toBeTruthy();

  const token = `e2eab${Date.now()}${Math.random().toString(36).slice(2, 10)}`;
  await queryTestDb(
    `INSERT INTO "Session" (id, token, "userId", "expiresAt", "createdAt")
     VALUES ($1, $2, $3, $4, $5)`,
    [token, token, adminId, new Date(Date.now() + 60 * 60 * 1000), new Date()],
  );

  const api = await playwrightRequest.newContext({
    baseURL,
    extraHTTPHeaders: { cookie: `zari_session=${token}` },
  });
  return { api, token };
}

async function closeAdminApi(api: APIRequestContext, token: string) {
  await api.dispose();
  await queryTestDb('DELETE FROM "Session" WHERE token = $1', [token]);
}

/**
 * 배정 API 로 후보 anonId 를 훑어 A·B 를 하나씩 고른다.
 *
 * 해시 배정이라 "어떤 anonId 가 어느 변형인가" 는 코드가 정한다 — 스펙이 그 값을 베껴 적으면
 * 해시를 바꿀 때 두 곳을 고쳐야 한다. 대신 **API 에 물어서** 고르면 스펙은 규칙을 모르는 채로
 * 두 변형을 모두 확인할 수 있다. (이 호출로 배정 줄이 먼저 생기지만, 배정은 어차피 고정값이라
 * 이후 화면 렌더가 같은 값을 본다 — 그게 이 테스트가 확인하려는 성질이다.)
 */
async function pickAnonIdsPerVariant(baseURL: string): Promise<Record<string, string>> {
  const api = await playwrightRequest.newContext({ baseURL });
  const picked: Record<string, string> = {};
  try {
    for (let index = 0; index < 30 && Object.keys(picked).length < 2; index += 1) {
      const anonId = candidateAnonId(index);
      const response = await api.get(`/api/ab/${EXPERIMENT}`, {
        headers: { cookie: `zari_anon=${anonId}` },
      });
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.assignment.anonId).toBe(anonId);
      picked[body.assignment.variant] ??= anonId;
    }
  } finally {
    await api.dispose();
  }
  expect(Object.keys(picked).sort(), "후보 30개 안에 A·B 가 모두 나와야 한다").toEqual(["A", "B"]);
  return picked;
}

test("E2E① 브라우저 컨텍스트 2개 — 각자 변형이 고정되고 화면·이벤트·DB 가 같은 값을 본다", async ({
  browser,
  baseURL,
}) => {
  const base = baseURL ?? "";
  const picked = await pickAnonIdsPerVariant(base);

  for (const [variant, anonId] of Object.entries(picked)) {
    const context = await openVisitor(browser, base, anonId);
    const page = await context.newPage();

    // ── 첫 방문: 배정된 변형이 그대로 그려진다
    await page.goto(`/notice/${SEED_TOKEN}`);
    await expect(page.getByTestId("notice-public")).toBeVisible();
    expect(await renderedVariant(page), `${anonId} 는 ${variant} 여야 한다`).toBe(variant);

    // 변형 B 는 금액 위에 배너가 하나 더 붙는다(D2 의 "배치" 안)
    await expect(page.getByTestId("notice-cta-banner")).toHaveCount(variant === "B" ? 1 : 0);

    // ── 다시 열어도 같은 변형 (결정성)
    for (let repeat = 0; repeat < 2; repeat += 1) {
      await page.reload();
      expect(await renderedVariant(page)).toBe(variant);
    }

    // ── DB 배정은 한 줄뿐이고 화면과 같다
    const rows = await assignmentOf(anonId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.variant).toBe(variant);

    // ── 노출 이벤트에도 같은 변형이 실린다(퍼널 1단계)
    await expect
      .poll(
        async () => {
          const events = await queryTestDb<{ props: { variant?: string } }>(
            `SELECT props FROM "TrackingEvent"
              WHERE "anonId" = $1 AND name = 'notice_view' ORDER BY "createdAt" DESC LIMIT 1`,
            [anonId],
          );
          return events[0]?.props.variant;
        },
        { timeout: 10_000 },
      )
      .toBe(variant);

    await context.close();
  }

  // ── 두 컨텍스트는 서로 다른 변형을 봤다 = 실험이 실제로 갈린다
  expect(new Set(Object.keys(picked)).size).toBe(2);
});

test("E2E② `?variant=` 미리보기는 배정을 바꾸지 않고, 어드민 퍼널이 그 이벤트를 세지 않는다", async ({
  browser,
  baseURL,
}) => {
  const base = baseURL ?? "";
  const picked = await pickAnonIdsPerVariant(base);
  const anonA = picked.A as string;

  // ── A 로 배정된 방문자가 ?variant=B 로 강제해서 연다
  const context = await openVisitor(browser, base, anonA);
  const page = await context.newPage();
  await page.goto(`/notice/${SEED_TOKEN}?variant=B`);
  await expect(page.getByTestId("notice-cta-banner")).toBeVisible();
  await expect(page.getByTestId("notice-cta-banner")).toHaveAttribute("data-variant", "B");

  // 화면만 B 다 — 배정은 그대로 A
  const rows = await assignmentOf(anonA);
  expect(rows).toHaveLength(1);
  expect(rows[0]?.variant).toBe("A");

  // 강제 화면에서 나간 노출 이벤트에는 B 가 실린다(= 배정과 어긋난다)
  await expect
    .poll(
      async () => {
        const events = await queryTestDb<{ count: string }>(
          `SELECT count(*)::text AS count FROM "TrackingEvent"
            WHERE "anonId" = $1 AND name = 'notice_view' AND props->>'variant' = 'B'`,
          [anonA],
        );
        return Number(events[0]?.count ?? 0);
      },
      { timeout: 10_000 },
    )
    .toBeGreaterThan(0);
  await context.close();

  // ── 어드민 지표 API (T6.2) — 화면이 아니라 web API 를 친다
  const anonymous = await playwrightRequest.newContext({ baseURL: base });
  expect((await anonymous.get("/api/admin/metrics/overview")).status()).toBe(401);
  expect((await anonymous.get("/api/admin/metrics/funnel")).status()).toBe(401);
  await anonymous.dispose();

  const { api, token } = await openAdminApi(base);
  try {
    const funnelResponse = await api.get("/api/admin/metrics/funnel");
    expect(funnelResponse.status()).toBe(200);
    const { funnel } = await funnelResponse.json();

    expect(funnel.experimentKey).toBe(EXPERIMENT);
    expect(funnel.steps.map((step: { event: string }) => step.event)).toEqual([
      "notice_view",
      "notice_cta_click",
      "signup_start",
      "signup_complete",
    ]);
    expect(funnel.variants).toHaveLength(2);
    // E2E① 이 만든 배정이 두 변형에 모두 있다
    for (const variant of funnel.variants) {
      expect(variant.assignedCount).toBeGreaterThan(0);
      // 누적 퍼널이라 카운트가 늘어나는 일은 없다
      for (const [index, step] of variant.steps.entries()) {
        if (index > 0) expect(step.count).toBeLessThanOrEqual(variant.steps[index - 1].count);
        expect(step.rateFromTop).toBeLessThanOrEqual(1);
      }
    }
    // 미리보기로 남은 이벤트는 제외된다
    expect(funnel.totals.mismatchedEvents).toBeGreaterThan(0);

    // 없는 실험 키는 404
    expect((await api.get("/api/admin/metrics/funnel?experiment=nope_nope")).status()).toBe(404);

    // ── 대시보드 집계가 시드 실데이터로 채워진다
    const overviewResponse = await api.get("/api/admin/metrics/overview?days=30&months=6");
    expect(overviewResponse.status()).toBe(200);
    const overview = await overviewResponse.json();

    expect(overview.daily).toHaveLength(30);
    expect(overview.collection.months).toHaveLength(6);
    expect(overview.summary.users).toBeGreaterThan(0);
    expect(overview.summary.visitors).toBeGreaterThan(0);
    // 시드에 청구·발송이 있으므로 수납률·열람률의 분모가 0 이 아니다
    expect(overview.collection.total.chargedAmount).toBeGreaterThan(0);
    expect(overview.summary.collectionRate).toBeGreaterThan(0);
    expect(overview.summary.collectionRate).toBeLessThanOrEqual(1);
    expect(overview.messages.total.trackable).toBeGreaterThan(0);
    expect(overview.refunds.stages).toHaveLength(7);
  } finally {
    await closeAdminApi(api, token);
  }
});
