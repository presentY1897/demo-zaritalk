import { expect, test, type Page } from "@playwright/test";
import { queryTestDb, trackedEventCount } from "./db";

/**
 * T2.6 통합(E2E) — **민원 접수·스레드**. task 문서 완료 기준 그대로다:
 * 접수 → 임대인 홈 배지 → 스레드 왕복 → 해결 → 세입자 확인.
 *
 * E2E① 세입자(박세입) 접수 → 임대인 홈 「새 민원 1건」 배지 → 스레드에서 답변 →
 *      진행중 → 해결 → 세입자가 답변과 「해결」을 확인
 * E2E② 권한 — 시드의 **제3자**(이중개)가 스레드 URL 을 열면 404, API 는 403
 *
 * 시드에 민원이 없으므로 **화면에서 직접 접수**하며 시작한다
 * (시드: 박세입 01022222222 · 201호 ACTIVE 계약 / 김임대 01011111111).
 *
 * 파일명 순서상 `auth` 다음(=`landlord-*` 앞)에 돈다. 여기서 만든 민원은 마지막에
 * **RESOLVED** 로 끝나므로 홈 배지(OPEN 만 센다)가 다시 0이 되고, 뒤 스펙이 보는
 * `/landlord` 화면은 시드 상태 그대로다. 청구·계약은 건드리지 않는다.
 */

const COMPLAINT_TITLE = "온수가 나오지 않습니다";

async function loginAsTenant(page: Page) {
  await page.goto("/login");
  await page.getByTestId("demo-login-tenant").click();
  await expect(page).toHaveURL("/tenant");
}

async function loginAsLandlord(page: Page) {
  await page.goto("/login");
  await page.getByTestId("demo-login-landlord").click();
  await expect(page).toHaveURL("/landlord");
}

test("E2E① 세입자 접수 → 임대인 홈 배지 → 답변 → 해결 → 세입자 확인", async ({ page }) => {
  // ── ① 세입자가 접수한다 (사진 없이 제목·내용만 — 업로드는 T2.4)
  await loginAsTenant(page);
  await page.goto("/tenant/complaints");
  await expect(page.getByTestId("complaint-empty")).toBeVisible();

  await page.getByTestId("complaint-new").click();
  await page.getByTestId("complaint-title").fill(COMPLAINT_TITLE);
  await page
    .getByTestId("complaint-body")
    .fill("어제 저녁부터 온수가 전혀 나오지 않습니다. 보일러 확인 부탁드립니다.");
  // 사진 자리는 아직 안내만 있다 (T2.4 업로드 연결 전)
  await expect(page.getByTestId("complaint-photo-slot")).toContainText("T2.4");
  await page.getByTestId("complaint-submit").click();

  const card = page.getByTestId("complaint-card").filter({ hasText: COMPLAINT_TITLE });
  await expect(card).toBeVisible();
  await expect(card).toContainText("접수");
  await expect(card).toContainText("행당해피빌 201호");

  // ── ② 임대인 홈의 미확인 민원 배지가 채워진다 (T1.9 집계 — 코드 변경 없이 동작한다)
  await loginAsLandlord(page);
  await expect(page.getByTestId("home-inbox")).toBeVisible();
  await expect(page.getByTestId("home-inbox-complaint")).toHaveText("새 민원 1건");

  // ── ③ 배지를 눌러 스레드로 (목적지는 `/landlord/complaints/[id]`)
  await page.getByTestId("home-inbox-complaint").click();
  await expect(page).toHaveURL(/\/landlord\/complaints\/[a-z0-9]+$/);
  const complaintId = page.url().split("/").at(-1)!;

  await expect(page.getByTestId("complaint-status")).toHaveText("접수");
  const opening = page.locator('[data-testid="complaint-message"][data-message-kind="OPENING"]');
  await expect(opening).toContainText("보일러 확인 부탁드립니다");
  await expect(opening).toContainText("박세입");

  // 「작업 의뢰로 전환」 — T2.6 때는 비활성 자리였고 T5.1 이 활성화했다.
  // 여기서는 버튼이 살아 있다는 것만 본다(전환 여정 자체는 `e2e/workorder.spec.ts` E2E② 담당).
  await expect(page.getByTestId("complaint-workorder-cta")).toBeEnabled();

  // ── ④ 임대인이 답변하고 상태를 진행중 → 해결로 옮긴다
  await page.getByTestId("complaint-message-input").fill("내일 오전에 설비 기사가 방문합니다.");
  await page.getByTestId("complaint-message-submit").click();
  await expect(
    page.locator('[data-testid="complaint-message"][data-author-role="LANDLORD"]'),
  ).toContainText("설비 기사가 방문합니다");

  await page.getByTestId("complaint-status-IN_PROGRESS").click();
  await expect(page.getByTestId("complaint-status")).toHaveText("진행중");
  // 같은 상태로는 다시 바꿀 수 없다(전이표) — 버튼이 비활성이 된다
  await expect(page.getByTestId("complaint-status-IN_PROGRESS")).toBeDisabled();

  await page.getByTestId("complaint-status-RESOLVED").click();
  await expect(page.getByTestId("complaint-status")).toHaveText("해결");

  // 해결되면 홈의 미확인 민원 배지가 사라진다(OPEN 만 센다)
  await page.goto("/landlord");
  await expect(page.getByTestId("home-inbox")).toHaveCount(0);

  // 임대인 목록에서도 「해결」로 보인다(이 task 가 최소한으로 만든 목록 화면)
  await page.goto("/landlord/complaints");
  await expect(
    page.getByTestId("complaint-card").filter({ hasText: COMPLAINT_TITLE }),
  ).toContainText("해결");

  // ── ⑤ 세입자가 답변과 「해결」을 확인한다
  await loginAsTenant(page);
  await page.goto("/tenant/complaints");
  await expect(
    page.getByTestId("complaint-card").filter({ hasText: COMPLAINT_TITLE }),
  ).toContainText("해결");

  await page.getByTestId("complaint-card").filter({ hasText: COMPLAINT_TITLE }).click();
  await expect(page).toHaveURL(`/tenant/complaints/${complaintId}`);
  await expect(page.getByTestId("complaint-status")).toHaveText("해결");
  await expect(
    page.locator('[data-testid="complaint-message"][data-author-role="LANDLORD"]'),
  ).toContainText("설비 기사가 방문합니다");
  // 임대인 전용 상태 패널은 세입자 화면에 없다
  await expect(page.getByTestId("complaint-status-panel")).toHaveCount(0);

  // 세입자도 스레드에 이어 쓸 수 있다
  await page.getByTestId("complaint-message-input").fill("고쳐 주셔서 감사합니다.");
  await page.getByTestId("complaint-message-submit").click();
  await expect(page.getByTestId("complaint-thread")).toContainText("감사합니다");

  // ── ⑥ 저장된 결과 (화면으로 드러나지 않는 필드는 DB 로 본다)
  const rows = await queryTestDb<{ status: string; messages: string }>(
    `SELECT c.status, count(m.id)::text AS messages
       FROM "Complaint" c LEFT JOIN "ComplaintMessage" m ON m."complaintId" = c.id
      WHERE c.id = $1 GROUP BY c.status`,
    [complaintId],
  );
  expect(rows[0]?.status).toBe("RESOLVED");
  expect(rows[0]?.messages).toBe("2"); // 접수 본문은 Complaint.body 라 메시지 행이 아니다

  // ── ⑦ 트래킹 (T0.7 규약)
  await expect.poll(() => trackedEventCount("complaint_create_complete")).toBeGreaterThan(0);
  await expect.poll(() => trackedEventCount("complaint_thread_view")).toBeGreaterThan(0);
  await expect.poll(() => trackedEventCount("complaint_message_send")).toBeGreaterThan(0);
  await expect.poll(() => trackedEventCount("complaint_status_change")).toBeGreaterThan(0);
});

test("E2E② 제3자는 스레드를 볼 수 없다 — 화면 404 · API 403", async ({ page }) => {
  const rows = await queryTestDb<{ id: string }>('SELECT id FROM "Complaint" LIMIT 1');
  const complaintId = rows[0]?.id;
  expect(complaintId, "E2E① 이 민원을 만들어 둔다").toBeTruthy();

  // 시드의 중개인(이중개)은 이 계약의 세입자도 임대인도 아니다
  await page.goto("/login");
  await page.getByTestId("demo-login-realtor").click();
  await expect(page).toHaveURL("/realtor");

  const response = await page.request.post(`/api/complaints/${complaintId}/messages`, {
    data: { body: "끼어들기" },
  });
  expect(response.status()).toBe(403);
  expect((await response.json()).error.code).toBe("FORBIDDEN");

  const patched = await page.request.patch(`/api/complaints/${complaintId}`, {
    data: { status: "IN_PROGRESS" },
  });
  expect(patched.status()).toBe(403);

  // 화면은 존재 여부를 흘리지 않는다 — 404
  const page404 = await page.goto(`/landlord/complaints/${complaintId}`);
  expect(page404?.status()).toBe(404);

  // 제3자의 글은 한 줄도 남지 않는다
  const messages = await queryTestDb<{ count: string }>(
    'SELECT count(*)::text AS count FROM "ComplaintMessage" WHERE "complaintId" = $1',
    [complaintId],
  );
  expect(messages[0]?.count).toBe("2");
});
