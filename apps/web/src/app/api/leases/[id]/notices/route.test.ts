import { prisma } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import { createLandlord, createTenantOnlyUser, loginAs } from "@/features/landlord/testing";
import { createNoticeScenario } from "@/features/notice/testing";
import { resetTestCookies } from "@/lib/auth/testing";
import { GET, POST } from "./route";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
});

function post(leaseId: string, body: unknown): Promise<Response> {
  return POST(
    new Request(`http://localhost/api/leases/${leaseId}/notices`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: leaseId }) },
  );
}

function get(leaseId: string): Promise<Response> {
  return GET(new Request(`http://localhost/api/leases/${leaseId}/notices`), {
    params: Promise.resolve({ id: leaseId }),
  });
}

test("비로그인이면 401", async () => {
  expect((await post("x", { kind: "RENT_NOTICE" })).status).toBe(401);
  expect((await get("x")).status).toBe(401);
});

test("임대인 프로필이 없으면 403", async () => {
  const { user } = await createTenantOnlyUser();
  await loginAs(user.id);
  expect((await post("x", { kind: "RENT_NOTICE" })).status).toBe(403);
});

test("없는 계약이면 404", async () => {
  const me = await createLandlord();
  await loginAs(me.user.id);
  expect((await post("nope", { kind: "CONTRACT_EXPIRY" })).status).toBe(404);
});

test("타인 계약에 발송하면 403 — 로그도 남지 않는다", async () => {
  const other = await createNoticeScenario({ phone: "01099999999", name: "남임대" });
  const me = await createLandlord("01011111111", "김임대");
  await loginAs(me.user.id);

  const res = await post(other.lease.id, { kind: "CONTRACT_EXPIRY" });
  expect(res.status).toBe(403);
  expect((await res.json()).error.code).toBe("FORBIDDEN");
  expect(await prisma.messageLog.count()).toBe(0);
});

test("월세 고지서를 보내면 201 — 토큰 발급 + MessageLog 생성", async () => {
  const scenario = await createNoticeScenario();
  await loginAs(scenario.landlord.user.id);

  const res = await post(scenario.lease.id, {
    kind: "RENT_NOTICE",
    chargeId: scenario.charge.id,
  });
  expect(res.status).toBe(201);

  const body = await res.json();
  expect(body.message).toMatchObject({
    kind: "RENT_NOTICE",
    toPhone: "01022222222",
    openedAt: null,
    leaseId: scenario.lease.id,
    chargeId: scenario.charge.id,
    tenantName: "박세입",
    buildingName: "행당해피빌",
    unitLabel: "201호",
  });
  expect(body.message.token).toMatch(/^[0-9a-f]{32}$/);
  expect(body.message.noticePath).toBe(`/notice/${body.message.token}`);
  expect(body.noticeUrl).toBe(`http://localhost/notice/${body.message.token}`);
  // 금액은 원장 엔진 분해 그대로 — 총액 1,015,500(이월 300,000 + 연체료 15,500 포함)
  expect(body.message.body).toContain("1,015,500원");
  expect(body.message.body).toContain("전월 이월 300,000원");

  const saved = await prisma.messageLog.findUnique({ where: { token: body.message.token } });
  expect(saved?.title).toBe("2026년 8월 월세 고지서");
});

test("연체·만기 고지서도 보낼 수 있다 (kind 3종)", async () => {
  const scenario = await createNoticeScenario();
  await loginAs(scenario.landlord.user.id);

  const overdue = await post(scenario.lease.id, {
    kind: "OVERDUE_NOTICE",
    chargeId: scenario.charge.id,
  });
  expect(overdue.status).toBe(201);
  expect((await overdue.json()).message.title).toBe("2026년 8월 월세 연체 안내");

  // 만기 안내는 청구를 고르지 않는다
  const expiry = await post(scenario.lease.id, { kind: "CONTRACT_EXPIRY" });
  expect(expiry.status).toBe(201);
  const expiryBody = await expiry.json();
  expect(expiryBody.message.chargeId).toBeNull();
  expect(expiryBody.message.title).toContain("임대차 계약 만기 안내");

  const kinds = await prisma.messageLog.findMany({ orderBy: { sentAt: "asc" } });
  expect(kinds.map((row) => row.kind)).toEqual(["OVERDUE_NOTICE", "CONTRACT_EXPIRY"]);
});

test("발송마다 토큰이 새로 발급되고 서로 겹치지 않는다 (@unique)", async () => {
  const scenario = await createNoticeScenario();
  await loginAs(scenario.landlord.user.id);

  const tokens = new Set<string>();
  for (let i = 0; i < 5; i += 1) {
    const res = await post(scenario.lease.id, {
      kind: "RENT_NOTICE",
      chargeId: scenario.charge.id,
    });
    expect(res.status).toBe(201);
    tokens.add((await res.json()).message.token);
  }
  expect(tokens.size).toBe(5);
  expect(await prisma.messageLog.count()).toBe(5);
});

test("월세·연체 고지서에 청구를 고르지 않으면 400", async () => {
  const scenario = await createNoticeScenario();
  await loginAs(scenario.landlord.user.id);

  const res = await post(scenario.lease.id, { kind: "RENT_NOTICE" });
  expect(res.status).toBe(400);
  expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  expect(await prisma.messageLog.count()).toBe(0);
});

test("다른 계약의 청구는 400, 없는 청구는 404", async () => {
  const mine = await createNoticeScenario();
  const other = await createNoticeScenario({ phone: "01099999999", name: "남임대" });
  await loginAs(mine.landlord.user.id);

  const wrongCharge = await post(mine.lease.id, {
    kind: "RENT_NOTICE",
    chargeId: other.charge.id,
  });
  expect(wrongCharge.status).toBe(400);

  const missing = await post(mine.lease.id, { kind: "RENT_NOTICE", chargeId: "nope" });
  expect(missing.status).toBe(404);
  expect(await prisma.messageLog.count()).toBe(0);
});

test("모르는 kind·긴 메모는 400", async () => {
  const scenario = await createNoticeScenario();
  await loginAs(scenario.landlord.user.id);

  expect((await post(scenario.lease.id, { kind: "OTP" })).status).toBe(400);
  expect(
    (await post(scenario.lease.id, { kind: "CONTRACT_EXPIRY", memo: "가".repeat(201) })).status,
  ).toBe(400);
});

test("GET — 발송 시트가 쓸 계약 정보(청구 목록 포함)를 준다", async () => {
  const scenario = await createNoticeScenario();
  await loginAs(scenario.landlord.user.id);

  const res = await get(scenario.lease.id);
  expect(res.status).toBe(200);

  const { target } = await res.json();
  expect(target).toMatchObject({
    leaseId: scenario.lease.id,
    tenantName: "박세입",
    landlordName: "김임대",
    buildingName: "행당해피빌",
    unitLabel: "201호",
    monthlyRent: 650_000,
  });
  // 상태·잔액은 저장값이 아니라 원장 엔진 재판정 결과다
  expect(target.charges[0]).toMatchObject({
    id: scenario.charge.id,
    totalDue: 1_015_500,
    outstanding: 1_015_500,
    status: "OVERDUE",
  });
  expect(target.charges[0].overdueDays).toBeGreaterThan(0);
});

test("GET — 타인 계약이면 403", async () => {
  const other = await createNoticeScenario({ phone: "01099999999", name: "남임대" });
  const me = await createLandlord();
  await loginAs(me.user.id);
  expect((await get(other.lease.id)).status).toBe(403);
});
