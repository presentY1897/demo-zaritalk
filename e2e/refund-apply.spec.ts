import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { queryTestDb } from "./db";

/**
 * T2.4·T2.5 통합(E2E) — **환급 신청 → 어드민 심사 → 스테퍼 완주**.
 *
 * T2.5 문서가 요구하는 여정 그대로다: 제출 → 보완요청 → 추가 업로드 → 승인 → 스테퍼 완료.
 *
 * ## 어드민 화면을 브라우저로 몰지 않은 이유
 *
 * 어드민은 **별도 Next 앱(포트 3001)** 이고 `playwright.config.ts` 의 `webServer` 는 web 앱
 * 하나만 띄운다 — 그 설정 파일은 이 task 소유가 아니라 손대지 않았다. 게다가 어드민 화면은
 * 규칙을 하나도 들고 있지 않다(버튼은 API 가 준 `availableActions` 를 그대로 그린다).
 * 즉 **위험은 전부 web API 쪽에 있으므로** 세입자 여정은 화면으로, 심사는 web API 로 친다.
 * 어드민 화면 렌더링은 `pnpm build` 와 단위 테스트가 지킨다.
 *
 * 심사 요청은 **어드민 세션 쿠키**로 보낸다(시크릿 헤더가 아니라). 시드의 관리자 계정
 * (`isAdmin: true`)에 세션 한 줄을 직접 만들어 쓰므로, 실제로 검증되는 것은
 * "`User.isAdmin` 기반 판정" 이라는 본선 경로다. 끝나면 그 세션을 지운다.
 *
 * ## 업로드는 실제 Blob 을 타지 않는다
 *
 * E2E 는 `zari_test…` DB 를 바라보고 도는데, 그때 `features/refund/storage.ts` 가
 * **메모리 드라이버**로 떨어진다(그 파일 주석의 표 참고). 실제 Vercel Blob 을 태우면
 * ① 네트워크·토큰에 의존해 CI 에서 깨지고 ② 스토어에 테스트 쓰레기가 쌓인다.
 * 드라이버만 바뀔 뿐 **경로 전체(권한·타입/크기 제한·`documents` 기록·뷰어 스트리밍)** 는
 * 그대로 지나가므로 여정 검증에는 손실이 없다.
 *
 * 시드: 박세입 01022222222(201호 ACTIVE 계약) · 관리자 01000000000(isAdmin).
 */

const LAST_YEAR = new Date().getFullYear() - 1;

const PDF = {
  mimeType: "application/pdf",
  buffer: Buffer.from("%PDF-1.4\n% zari demo test document\n"),
};

async function loginAsTenant(page: Page) {
  await page.goto("/login");
  await page.getByTestId("demo-login-tenant").click();
  await expect(page).toHaveURL("/tenant");
}

/**
 * 가로 오버플로 감시 — **이 스펙이 CI 에서만 죽던 진짜 원인**이라 클릭 전에 먼저 잡는다.
 *
 * 화면이 393px 모바일 셸보다 넓어지면 크로뮴 모바일 에뮬레이션이 화면을 축소한다
 * (레이아웃 뷰포트 393→406, page scale ≈ 0.97). 그러면 Playwright 가 CSS 좌표로 계산한
 * 클릭 지점과 크로뮴이 실제로 이벤트를 떨어뜨리는 지점이 **스크롤한 만큼 벌어져서**,
 * 페이지 아래쪽 버튼을 누르면 옆의 `<main>` 이나 하단 탭바가 대신 맞는다 —
 * Playwright 는 이를 "intercepts pointer events" 로 보고 영원히 재시도하다 예산을 태운다.
 * (원인은 `input[type="date"]` 두 칸이었다. 자세한 경위는
 * `docs/tasks/t0.2-test-infra.md` 의 "CI 가 로컬과 다른 점" 표 참고.)
 *
 * 여기서 걸리면 120초짜리 클릭 타임아웃 대신 **어느 화면이 몇 px 넘쳤는지** 바로 보인다.
 */
async function expectFitsShell(page: Page, where: string) {
  const shellWidth = page.viewportSize()?.width ?? 0;
  // `window`/`document` 대신 `globalThis` — e2e 는 DOM 타입이 없는 node tsconfig 로 타입 검사한다
  // (`e2e/shell.spec.ts` 와 같은 이유·같은 방식).
  const layout = await page.evaluate(() => {
    const win = globalThis as unknown as {
      innerWidth: number;
      document: { documentElement: { scrollWidth: number } };
    };
    return { innerWidth: win.innerWidth, scrollWidth: win.document.documentElement.scrollWidth };
  });
  expect(
    layout,
    `${where}: 가로로 셸(${shellWidth}px)을 뚫었다 — 모바일 축소가 걸려 클릭 좌표가 어긋난다`,
  ).toEqual({ innerWidth: shellWidth, scrollWidth: shellWidth });
}

/** 시드 관리자 계정으로 세션을 한 줄 만들어 어드민 API 컨텍스트를 연다 */
async function openAdminApi(baseURL: string): Promise<{ api: APIRequestContext; token: string }> {
  const admins = await queryTestDb<{ id: string }>(
    'SELECT id FROM "User" WHERE "isAdmin" = true ORDER BY "createdAt" ASC LIMIT 1',
  );
  const adminId = admins[0]?.id;
  expect(adminId, "시드에 관리자 계정(isAdmin)이 있어야 한다").toBeTruthy();

  const token = `e2eadmin${Date.now()}${Math.random().toString(36).slice(2, 10)}`;
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

test("E2E① 계산기 → 신청서 → 제출 → 보완요청 → 추가 업로드 → 승인 → 완료", async ({
  page,
  baseURL,
}) => {
  // ── ① 세입자로 로그인하고 계산기에서 신청 화면으로 넘어온다 (T2.3 → T2.4 접합)
  await loginAsTenant(page);
  await expect(page.getByTestId("tenant-refund-status-link")).toBeVisible();

  await page.goto("/refund/calculator");
  await page.getByTestId("refund-gross-salary").fill("48000000");
  await page.getByTestId("refund-monthly-rent").fill("500000");
  await page.getByTestId("refund-start-date").fill(`${LAST_YEAR}-01-01`);
  await page.getByTestId("refund-end-date").fill(`${LAST_YEAR}-12-31`);
  await expectFitsShell(page, "/refund/calculator");
  await page.getByTestId("refund-submit").click();
  await expect(page.getByTestId("refund-total-credit")).toHaveText("1,020,000원");

  const cta = page.getByTestId("refund-cta");
  await expect(cta).toHaveAttribute("data-logged-in", "true");
  await cta.click();

  // ── ② 신청서가 계산 입력으로 **미리 채워진다**
  await expect(page).toHaveURL(/\/tenant\/refund\/apply\?grossSalary=48000000/);
  await expect(page.getByTestId("refund-apply-gross-salary")).toHaveValue("48000000");
  await expect(page.getByTestId("refund-apply-monthly-rent")).toHaveValue("500000");
  await expect(page.getByTestId("refund-apply-start-date")).toHaveValue(`${LAST_YEAR}-01-01`);
  await expect(page.getByTestId("refund-apply-expected")).toHaveText("1,020,000원");
  await expect(page.getByTestId("refund-apply-disclaimer")).toContainText("실제 세법 자문이 아니");

  // 서류를 올리려면 먼저 임시저장해야 한다(업로드는 신청 id 를 요구한다)
  await expect(page.getByTestId("refund-apply-upload-locked")).toBeVisible();
  await expect(page.getByTestId("refund-apply-submit")).toBeDisabled();
  await expectFitsShell(page, "/tenant/refund/apply");

  // ── ③ 임시저장(DRAFT) → 서류 업로드
  await page.getByTestId("refund-apply-save").click();
  await expect(page.getByTestId("refund-apply-saved")).toBeVisible();
  await expect(page.getByTestId("refund-doc-uploader")).toBeVisible();
  // 필수 서류가 아직 없어 제출은 잠겨 있다
  await expect(page.getByTestId("refund-apply-submit")).toBeDisabled();
  await expect(page.getByTestId("refund-apply-missing")).toContainText("임대차계약서");

  await page
    .getByTestId("refund-doc-input-LEASE_CONTRACT")
    .setInputFiles({ name: "임대차계약서.pdf", ...PDF });
  await expect(page.getByTestId("refund-doc-slot-LEASE_CONTRACT")).toContainText("임대차계약서.pdf");
  await expect(page.getByTestId("refund-apply-submit")).toBeDisabled(); // 등본이 아직 없다

  await page
    .getByTestId("refund-doc-input-RESIDENT_REGISTRATION")
    .setInputFiles({ name: "주민등록등본.pdf", ...PDF });
  await expect(page.getByTestId("refund-doc-slot-RESIDENT_REGISTRATION")).toContainText(
    "주민등록등본.pdf",
  );

  // ── ④ 제출 → 상태 화면
  await expect(page.getByTestId("refund-apply-submit")).toBeEnabled();
  await page.getByTestId("refund-apply-submit").click();
  await expect(page).toHaveURL("/tenant/refund");
  await expect(page.getByTestId("refund-status-badge")).toHaveText("제출");
  await expect(
    page.locator('[data-testid="refund-step-SUBMIT"] [data-state="current"]'),
  ).toBeVisible();
  await expect(page.getByTestId("refund-status-amount")).toHaveText("1,020,000원");

  const applications = await queryTestDb<{ id: string; status: string }>(
    `SELECT r.id, r.status FROM "RefundApplication" r
       JOIN "Profile" p ON p.id = r."tenantProfileId"
       JOIN "User" u ON u.id = p."userId"
      WHERE u.phone = '01022222222'
      ORDER BY r."createdAt" DESC LIMIT 1`,
  );
  const applicationId = applications[0]?.id;
  expect(applications[0]?.status).toBe("SUBMITTED");
  expect(applicationId).toBeTruthy();

  // ── ⑤ 어드민이 심사를 시작하고 보완을 요청한다 (web API · 어드민 세션)
  const { api, token } = await openAdminApi(baseURL!);
  try {
    const queue = await api.get("/api/refunds?scope=review");
    expect(queue.status()).toBe(200);
    const queueBody = await queue.json();
    expect(queueBody.applications.map((a: { id: string }) => a.id)).toContain(applicationId);

    const started = await api.post(`/api/refunds/${applicationId}/review`, {
      data: { action: "START" },
    });
    expect(started.status()).toBe(200);
    expect((await started.json()).application.status).toBe("REVIEWING");

    // 코멘트 없는 보완요청은 거부된다(코멘트 필수)
    const noNote = await api.post(`/api/refunds/${applicationId}/review`, {
      data: { action: "NEED_MORE_DOCS" },
    });
    expect(noNote.status()).toBe(400);

    const needMore = await api.post(`/api/refunds/${applicationId}/review`, {
      data: {
        action: "NEED_MORE_DOCS",
        note: "주민등록등본에 전입일이 보이지 않습니다. 다시 올려 주세요.",
      },
    });
    expect(needMore.status()).toBe(200);
    expect((await needMore.json()).application.status).toBe("NEED_MORE_DOCS");

    // ── ⑥ 세입자 화면에 보완요청과 심사 코멘트가 뜬다 → 추가 업로드 → 재제출
    await page.goto("/tenant/refund");
    await expect(page.getByTestId("refund-status-badge")).toHaveText("보완요청");
    await expect(page.getByTestId("refund-review-note")).toContainText("전입일이 보이지 않습니다");
    await expect(
      page.locator('[data-testid="refund-step-REVIEW"] [data-state="current"]'),
    ).toBeVisible();

    await page
      .getByTestId("refund-doc-input-RESIDENT_REGISTRATION")
      .setInputFiles({ name: "주민등록등본_재발급.pdf", ...PDF });
    await expect(page.getByTestId("refund-doc-slot-RESIDENT_REGISTRATION")).toContainText(
      "주민등록등본_재발급.pdf",
    );

    await page.getByTestId("refund-resubmit").click();
    await expect(page.getByTestId("refund-status-badge")).toHaveText("심사중");

    // ── ⑦ 어드민 승인 → 지급 완료
    const approved = await api.post(`/api/refunds/${applicationId}/review`, {
      data: { action: "APPROVE", note: "확인했습니다." },
    });
    expect(approved.status()).toBe(200);

    const completed = await api.post(`/api/refunds/${applicationId}/review`, {
      data: { action: "COMPLETE" },
    });
    expect(completed.status()).toBe(200);
    expect((await completed.json()).application.status).toBe("COMPLETED");
  } finally {
    await closeAdminApi(api, token);
  }

  // ── ⑧ 세입자 스테퍼가 끝까지 찬다
  await page.goto("/tenant/refund");
  await expect(page.getByTestId("refund-status-badge")).toHaveText("완료");
  await expect(page.locator('[data-testid="refund-step-DONE"] [data-state="current"]')).toBeVisible();
  await expect(page.locator('[data-testid="refund-step-SUBMIT"] [data-state="done"]')).toBeVisible();
  await expect(page.getByTestId("refund-status-documents")).toBeVisible();

  // ── ⑨ DB — 상태·심사자·시각이 기록되고 액션마다 알림톡 시뮬이 남았다
  const rows = await queryTestDb<{
    status: string;
    reviewedById: string | null;
    submittedAt: string | null;
    decidedAt: string | null;
    documents: unknown;
  }>(
    `SELECT status, "reviewedById", "submittedAt", "decidedAt", documents
       FROM "RefundApplication" WHERE id = $1`,
    [applicationId],
  );
  expect(rows[0]?.status).toBe("COMPLETED");
  expect(rows[0]?.reviewedById).toBeTruthy();
  expect(rows[0]?.submittedAt).toBeTruthy();
  expect(rows[0]?.decidedAt).toBeTruthy();
  expect((rows[0]?.documents as { files: unknown[] }).files).toHaveLength(3);

  const logs = await queryTestDb<{ title: string }>(
    `SELECT title FROM "MessageLog"
      WHERE "toPhone" = '01022222222' AND title LIKE '%환급 신청%'
      ORDER BY "sentAt" ASC`,
  );
  // 심사시작 · 보완요청 · 승인 · 완료 = 4건
  expect(logs).toHaveLength(4);
  expect(logs.at(-1)?.title).toContain("완료");

  // ── ⑩ 트래킹 — 신청 화면 노출 · 업로드 · 제출 · 상태 화면 노출
  const anon = (await page.context().cookies()).find((c) => c.name === "zari_anon")?.value;
  expect(anon).toBeTruthy();
  await expect
    .poll(
      async () => {
        const events = await queryTestDb<{ name: string }>(
          `SELECT DISTINCT name FROM "TrackingEvent" WHERE "anonId" = $1 AND name LIKE 'refund_%'`,
          [anon],
        );
        return events.map((row) => row.name).sort();
      },
      { timeout: 15_000 },
    )
    .toEqual([
      "refund_apply_submit",
      "refund_apply_view",
      "refund_calc_submit",
      "refund_cta_click",
      "refund_doc_upload",
      "refund_status_view",
    ]);
});

test("E2E② 업로드 제한(타입·크기)은 화면에서 막고, 남의 신청·비어드민은 API 가 막는다", async ({
  page,
  baseURL,
}) => {
  await loginAsTenant(page);
  await page.goto("/tenant/refund/apply");

  // 새 신청을 임시저장한다(E2E① 의 신청은 완료 상태라 새 DRAFT 를 만들 수 있다)
  await page.getByTestId("refund-apply-gross-salary").fill("48000000");
  await page.getByTestId("refund-apply-monthly-rent").fill("500000");
  await page.getByTestId("refund-apply-start-date").fill(`${LAST_YEAR}-01-01`);
  await page.getByTestId("refund-apply-end-date").fill(`${LAST_YEAR}-12-31`);
  await expectFitsShell(page, "/tenant/refund/apply");
  await page.getByTestId("refund-apply-save").click();
  await expect(page.getByTestId("refund-apply-saved")).toBeVisible();

  // ── 허용하지 않는 타입은 서버까지 가지 않고 화면에서 막힌다(같은 규칙을 공유한다)
  await page.getByTestId("refund-doc-input-LEASE_CONTRACT").setInputFiles({
    name: "계약서.hwp",
    mimeType: "application/x-hwp",
    buffer: Buffer.from("hwp"),
  });
  await expect(page.getByTestId("refund-doc-error")).toContainText("파일만 올릴 수 있습니다");

  // ── 4MB 를 넘는 파일도 화면에서 막힌다
  await page.getByTestId("refund-doc-input-LEASE_CONTRACT").setInputFiles({
    name: "너무큰계약서.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.alloc(4 * 1024 * 1024 + 1),
  });
  await expect(page.getByTestId("refund-doc-error")).toContainText("MB 까지");

  // 아무것도 올라가지 않았다
  await expect(page.getByTestId("refund-apply-submit")).toBeDisabled();

  // ── 심사 API 는 세입자 세션(비어드민)에게 403 이다
  const drafts = await queryTestDb<{ id: string }>(
    `SELECT r.id FROM "RefundApplication" r
       JOIN "Profile" p ON p.id = r."tenantProfileId"
       JOIN "User" u ON u.id = p."userId"
      WHERE u.phone = '01022222222' AND r.status = 'DRAFT'
      ORDER BY r."createdAt" DESC LIMIT 1`,
  );
  const draftId = drafts[0]?.id;
  expect(draftId).toBeTruthy();

  const asTenant = await page.request.post(`/api/refunds/${draftId}/review`, {
    data: { action: "START" },
  });
  expect(asTenant.status()).toBe(403);

  // ── 로그인하지 않은 요청은 401
  const anonymous = await playwrightRequest.newContext({ baseURL: baseURL! });
  try {
    expect((await anonymous.get("/api/refunds?scope=review")).status()).toBe(401);
    expect((await anonymous.get("/api/refunds")).status()).toBe(401);
  } finally {
    await anonymous.dispose();
  }

  // 남긴 DRAFT 를 지워 뒤 스펙이 보는 시드 상태를 흐트러뜨리지 않는다
  await queryTestDb('DELETE FROM "RefundApplication" WHERE id = $1', [draftId]);
});
