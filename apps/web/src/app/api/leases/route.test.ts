import { prisma } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import { createLandlord, createTenantOnlyUser, loginAs } from "@/features/landlord/testing";
import {
  createLandlordWithUnit,
  createLeaseWithCharge,
  currentPeriod,
} from "@/features/lease/testing";
import { resetTestCookies } from "@/lib/auth/testing";
import { dueDateFor, kstYearMonth, resolveChargeStatus, kstToday } from "@/lib/rent";
import { GET, POST } from "./route";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
});

const getReq = (search = "") => new Request(`http://localhost/api/leases${search}`);

function postReq(body: unknown): Request {
  return new Request("http://localhost/api/leases", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validBody(unitId: string, overrides: Record<string, unknown> = {}) {
  return {
    unitId,
    tenantName: "박세입",
    tenantPhone: "010-2222-2222",
    deposit: 20_000_000,
    monthlyRent: 650_000,
    maintenanceFee: 50_000,
    paymentDay: 5,
    ...currentPeriod(),
    lateFeeRatePct: 5,
    ...overrides,
  };
}

test("비로그인이면 401", async () => {
  expect((await GET(getReq())).status).toBe(401);
  expect((await POST(postReq(validBody("x")))).status).toBe(401);
});

test("임대인 프로필이 없으면 403", async () => {
  const tenant = await createTenantOnlyUser();
  await loginAs(tenant.user.id);
  expect((await GET(getReq())).status).toBe(403);
});

test("목록은 내 계약만 준다", async () => {
  const me = await createLandlordWithUnit("01011111111");
  const other = await createLandlordWithUnit("01099999999");
  const mine = await createLeaseWithCharge(me.unit.id);
  await createLeaseWithCharge(other.unit.id);
  await loginAs(me.user.id);

  const body = await (await GET(getReq())).json();
  expect(body.leases.map((lease: { id: string }) => lease.id)).toEqual([mine.lease.id]);
  expect(body.leases[0].unit.label).toBe("201호");
  expect(body.leases[0].chargeSummary.totalCount).toBe(1);
});

test("목록을 호실로 좁힌다", async () => {
  const me = await createLandlordWithUnit("01011111111", ["201호", "202호"]);
  const first = await createLeaseWithCharge(me.units[0]!.id);
  await createLeaseWithCharge(me.units[1]!.id);
  await loginAs(me.user.id);

  const body = await (await GET(getReq(`?unitId=${me.units[0]!.id}`))).json();
  expect(body.leases.map((lease: { id: string }) => lease.id)).toEqual([first.lease.id]);
});

test("계약을 등록하면 PENDING_TENANT + 당월 청구가 함께 만들어진다 (dueDate = 납부일)", async () => {
  const me = await createLandlordWithUnit();
  await loginAs(me.user.id);

  const res = await POST(postReq(validBody(me.unit.id)));
  expect(res.status).toBe(201);
  const body = await res.json();

  expect(body.lease.status).toBe("PENDING_TENANT");
  expect(body.lease.tenantProfileId).toBeNull();
  // 전화번호는 T0.3 규칙대로 숫자만 남긴다
  expect(body.lease.tenantPhone).toBe("01022222222");

  const { year, month } = kstYearMonth();
  const dueDate = dueDateFor(year, month, 5);
  expect(body.charge).toMatchObject({
    year,
    month,
    dueDate: dueDate.toISOString().slice(0, 10),
    rentAmount: 650_000,
    maintenanceAmount: 50_000,
    // 신규 계약이라 전월 청구가 없다 → 이월·연체료 0
    carriedOverAmount: 0,
    lateFeeAmount: 0,
    totalDue: 700_000,
    paidAmount: 0,
  });
  // 상태는 원장 엔진 판정과 같아야 한다(오늘이 납부일을 지났으면 연체)
  expect(body.charge.status).toBe(
    resolveChargeStatus({ totalDue: 700_000, paidAmount: 0, dueDate, asOf: kstToday() }),
  );

  const saved = await prisma.rentCharge.findMany({ where: { leaseId: body.lease.id } });
  expect(saved).toHaveLength(1);
});

test("계약 기간이 역전되면 400", async () => {
  const me = await createLandlordWithUnit();
  await loginAs(me.user.id);

  const res = await POST(
    postReq(validBody(me.unit.id, { startDate: "2027-02-28", endDate: "2026-03-01" })),
  );
  expect(res.status).toBe(400);
  expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  expect(await prisma.lease.count()).toBe(0);
});

test("같은 호실에 기간이 겹치는 계약이 있으면 409", async () => {
  const me = await createLandlordWithUnit();
  await createLeaseWithCharge(me.unit.id); // 이번 달 ~ 1년
  await loginAs(me.user.id);

  const res = await POST(postReq(validBody(me.unit.id)));
  expect(res.status).toBe(409);
  expect((await res.json()).error.code).toBe("CONFLICT");
  expect(await prisma.lease.count()).toBe(1);
});

test("종료된 계약과는 기간이 겹쳐도 등록할 수 있다", async () => {
  const me = await createLandlordWithUnit();
  await createLeaseWithCharge(me.unit.id, { status: "ENDED" });
  await loginAs(me.user.id);

  expect((await POST(postReq(validBody(me.unit.id)))).status).toBe(201);
});

test("겹치지 않는 다음 기간은 등록할 수 있다", async () => {
  const me = await createLandlordWithUnit();
  await loginAs(me.user.id);

  expect(
    (
      await POST(
        postReq(validBody(me.unit.id, { startDate: "2030-01-01", endDate: "2030-12-31" })),
      )
    ).status,
  ).toBe(201);
  expect(
    (
      await POST(
        postReq(validBody(me.unit.id, { startDate: "2031-01-01", endDate: "2031-12-31" })),
      )
    ).status,
  ).toBe(201);
});

test("타인 호실에는 계약을 만들 수 없다 — 403", async () => {
  const me = await createLandlord("01011111111");
  const other = await createLandlordWithUnit("01099999999");
  await loginAs(me.user.id);

  const res = await POST(postReq(validBody(other.unit.id)));
  expect(res.status).toBe(403);
  expect(await prisma.lease.count()).toBe(0);
});

test("없는 호실 id 는 404", async () => {
  const me = await createLandlordWithUnit();
  await loginAs(me.user.id);
  expect((await POST(postReq(validBody("nope")))).status).toBe(404);
});

test("이미 끝난 기간의 계약을 입력하면 청구는 만들지 않는다", async () => {
  const me = await createLandlordWithUnit();
  await loginAs(me.user.id);

  const res = await POST(
    postReq(validBody(me.unit.id, { startDate: "2020-01-01", endDate: "2020-12-31" })),
  );
  expect(res.status).toBe(201);
  const body = await res.json();
  expect(body.charge).toBeNull();
  expect(await prisma.rentCharge.count()).toBe(0);
});

test("전화번호 형식이 아니면 400", async () => {
  const me = await createLandlordWithUnit();
  await loginAs(me.user.id);
  expect((await POST(postReq(validBody(me.unit.id, { tenantPhone: "123" })))).status).toBe(400);
});
