import { prisma } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test } from "vitest";
import { createNoticeLog, createNoticeScenario } from "@/features/notice/testing";
import { GET } from "./route";

/**
 * 공개 고지서 API (T1.8).
 * **로그인 상태를 만들지 않는다** — 비로그인으로 열리는 것이 이 엔드포인트의 전부다.
 */

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
});

function get(token: string, init?: { cookie?: string; variant?: string }): Promise<Response> {
  const query = init?.variant ? `?variant=${init.variant}` : "";
  return GET(
    new Request(`http://localhost/api/notices/${token}${query}`, {
      headers: init?.cookie ? { cookie: init.cookie } : {},
    }),
    { params: Promise.resolve({ token }) },
  );
}

test("없는 토큰·형식이 아닌 토큰은 404", async () => {
  expect((await get("no-such-token-here")).status).toBe(404);
  expect((await get("x")).status).toBe(404);
  expect((await get("../../etc/passwd")).status).toBe(404);
  expect(await prisma.trackingEvent.count()).toBe(0);
});

test("비로그인으로 청구 내역이 열린다 — 번호는 가려서 나간다", async () => {
  const scenario = await createNoticeScenario();
  await createNoticeLog({
    token: "demo-notice-test",
    leaseId: scenario.lease.id,
    chargeId: scenario.charge.id,
  });

  const res = await get("demo-notice-test");
  expect(res.status).toBe(200);

  const { notice } = await res.json();
  expect(notice).toMatchObject({
    token: "demo-notice-test",
    landlordName: "김임대",
    tenantName: "박세입",
    tenantPhoneMasked: "010-****-2222",
    buildingName: "행당해피빌",
    unitLabel: "201호",
  });
  // 금액 내역은 원장 엔진 분해 그대로 (0원 줄 포함 4줄)
  expect(notice.charge.totalDue).toBe(1_015_500);
  expect(notice.charge.outstanding).toBe(1_015_500);
  expect(notice.charge.status).toBe("OVERDUE");
  expect(notice.charge.lines).toHaveLength(4);
  expect(notice.charge.lines.map((line: { label: string }) => line.label)).toEqual([
    "월세",
    "관리비",
    "전월 이월",
    "연체료",
  ]);
  expect(notice.bankAccount.holder).toBe("김임대");
  // 전화번호 원본은 응답에 없다
  expect(JSON.stringify(notice)).not.toContain("01022222222");
});

test("openedAt 은 최초 1회만 기록된다", async () => {
  const scenario = await createNoticeScenario();
  await createNoticeLog({ token: "demo-notice-open", leaseId: scenario.lease.id });

  const first = await get("demo-notice-open");
  expect((await first.json()).firstOpen).toBe(true);
  const afterFirst = await prisma.messageLog.findUnique({ where: { token: "demo-notice-open" } });
  expect(afterFirst?.openedAt).not.toBeNull();

  const second = await get("demo-notice-open");
  expect((await second.json()).firstOpen).toBe(false);
  const afterSecond = await prisma.messageLog.findUnique({ where: { token: "demo-notice-open" } });
  expect(afterSecond?.openedAt?.toISOString()).toBe(afterFirst?.openedAt?.toISOString());
});

test("이미 열람한 고지서는 그 시각을 유지한다", async () => {
  const scenario = await createNoticeScenario();
  const openedAt = new Date("2026-08-20T05:00:00Z");
  await createNoticeLog({ token: "demo-notice-seen", leaseId: scenario.lease.id, openedAt });

  const res = await get("demo-notice-seen");
  expect((await res.json()).firstOpen).toBe(false);
  const row = await prisma.messageLog.findUnique({ where: { token: "demo-notice-seen" } });
  expect(row?.openedAt?.toISOString()).toBe(openedAt.toISOString());
});

test("조회할 때마다 notice_view 가 쌓인다 — anonId·variant 포함", async () => {
  const scenario = await createNoticeScenario();
  await createNoticeLog({ token: "demo-notice-track", leaseId: scenario.lease.id });
  const anonId = "a".repeat(32);

  await get("demo-notice-track", { cookie: `zari_anon=${anonId}`, variant: "B" });
  await get("demo-notice-track", { cookie: `zari_anon=${anonId}` });

  const events = await prisma.trackingEvent.findMany({ orderBy: { createdAt: "asc" } });
  expect(events).toHaveLength(2);
  expect(events[0]).toMatchObject({ name: "notice_view", anonId, path: "/notice/demo-notice-track" });
  expect(events[0]?.props).toMatchObject({ token: "demo-notice-track", variant: "B", firstOpen: true });
  // 두 번째 조회는 열람 갱신이 아니다(firstOpen false) — 그래도 조회 이벤트는 쌓인다
  expect(events[1]?.props).toMatchObject({ variant: "A", firstOpen: false });
});

test("anonId 쿠키가 없으면 서버가 발급해 응답에 심는다", async () => {
  const scenario = await createNoticeScenario();
  await createNoticeLog({ token: "demo-notice-anon", leaseId: scenario.lease.id });

  const res = await get("demo-notice-anon");
  expect(res.headers.get("set-cookie")).toMatch(/^zari_anon=[0-9a-f]{32};/);

  const event = await prisma.trackingEvent.findFirst();
  expect(event?.anonId).toMatch(/^[0-9a-f]{32}$/);
});

test("청구 없이 보낸 만기 안내도 열린다 (charge null)", async () => {
  const scenario = await createNoticeScenario();
  await prisma.messageLog.create({
    data: {
      kind: "CONTRACT_EXPIRY",
      toPhone: "01022222222",
      title: "임대차 계약 만기 안내",
      body: "만기가 다가옵니다.",
      token: "demo-notice-expiry",
      leaseId: scenario.lease.id,
    },
  });

  const { notice } = await (await get("demo-notice-expiry")).json();
  expect(notice.charge).toBeNull();
  expect(notice.lease.endDate).toBe("2027-02-28");
  expect(notice.kind).toBe("CONTRACT_EXPIRY");
});
