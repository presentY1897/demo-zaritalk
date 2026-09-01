import { prisma } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import { createLandlord, createTenantOnlyUser, loginAs } from "@/features/landlord/testing";
import { createNoticeLog, createNoticeScenario } from "@/features/notice/testing";
import { resetTestCookies } from "@/lib/auth/testing";
import { GET } from "./route";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
});

function get(query = ""): Promise<Response> {
  return GET(new Request(`http://localhost/api/landlord/messages${query}`));
}

test("비로그인이면 401, 임대인 프로필이 없으면 403", async () => {
  expect((await get()).status).toBe(401);

  const { user } = await createTenantOnlyUser();
  await loginAs(user.id);
  expect((await get()).status).toBe(403);
});

test("내 건물 계약의 발송만 보인다 (남의 발송 제외)", async () => {
  const mine = await createNoticeScenario();
  const other = await createNoticeScenario({ phone: "01099999999", name: "남임대" });
  await createNoticeLog({ token: "mine-token-0001", leaseId: mine.lease.id, chargeId: mine.charge.id });
  await createNoticeLog({ token: "other-token-0001", leaseId: other.lease.id });
  // 계약이 없는 발송(OTP)은 이력에 섞이지 않는다
  await prisma.messageLog.create({
    data: { kind: "OTP", toPhone: "01011111111", title: "인증번호", body: "123456" },
  });

  await loginAs(mine.landlord.user.id);
  const res = await get();
  expect(res.status).toBe(200);

  const { messages } = await res.json();
  expect(messages).toHaveLength(1);
  expect(messages[0]).toMatchObject({
    token: "mine-token-0001",
    noticePath: "/notice/mine-token-0001",
    tenantName: "박세입",
    buildingName: "행당해피빌",
    unitLabel: "201호",
    openedAt: null,
  });
});

test("열람 여부(openedAt)가 그대로 실려 온다", async () => {
  const mine = await createNoticeScenario();
  await createNoticeLog({
    token: "opened-token-0001",
    leaseId: mine.lease.id,
    openedAt: new Date("2026-08-20T05:00:00Z"),
  });
  await loginAs(mine.landlord.user.id);

  const { messages } = await (await get()).json();
  expect(messages[0].openedAt).toBe("2026-08-20T05:00:00.000Z");
});

test("최신 발송이 먼저 온다", async () => {
  const mine = await createNoticeScenario();
  await prisma.messageLog.create({
    data: {
      kind: "RENT_NOTICE",
      toPhone: "01022222222",
      title: "옛날 고지서",
      body: "…",
      token: "old-token-0001",
      leaseId: mine.lease.id,
      sentAt: new Date("2026-07-01T00:00:00Z"),
    },
  });
  await prisma.messageLog.create({
    data: {
      kind: "OVERDUE_NOTICE",
      toPhone: "01022222222",
      title: "최근 고지서",
      body: "…",
      token: "new-token-0001",
      leaseId: mine.lease.id,
      sentAt: new Date("2026-08-01T00:00:00Z"),
    },
  });
  await loginAs(mine.landlord.user.id);

  const { messages } = await (await get()).json();
  expect(messages.map((message: { title: string }) => message.title)).toEqual([
    "최근 고지서",
    "옛날 고지서",
  ]);
});

test("leaseId 필터 — 내 계약이면 그 계약 것만, 남의 계약이면 403", async () => {
  const mine = await createNoticeScenario();
  const other = await createNoticeScenario({ phone: "01099999999", name: "남임대" });
  await createNoticeLog({ token: "mine-token-0002", leaseId: mine.lease.id });
  await loginAs(mine.landlord.user.id);

  const ok = await get(`?leaseId=${mine.lease.id}`);
  expect(ok.status).toBe(200);
  expect((await ok.json()).messages).toHaveLength(1);

  expect((await get(`?leaseId=${other.lease.id}`)).status).toBe(403);
  expect((await get("?leaseId=nope")).status).toBe(404);
});

test("모르는 쿼리 파라미터는 400", async () => {
  const mine = await createNoticeScenario();
  await loginAs(mine.landlord.user.id);
  expect((await get("?unknown=1")).status).toBe(400);
});
