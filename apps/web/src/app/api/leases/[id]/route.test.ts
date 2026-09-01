import { prisma } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import { loginAs } from "@/features/landlord/testing";
import { addPayment, createLandlordWithUnit, createLeaseWithCharge } from "@/features/lease/testing";
import { resetTestCookies } from "@/lib/auth/testing";
import { kstToday, kstYearMonth, utcDate } from "@/lib/rent";
import { GET, PATCH } from "./route";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (id: string) => new Request(`http://localhost/api/leases/${id}`);

function patch(id: string, body: unknown): Promise<Response> {
  return PATCH(
    new Request(`http://localhost/api/leases/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    ctx(id),
  );
}

test("비로그인이면 401", async () => {
  expect((await GET(req("x"), ctx("x"))).status).toBe(401);
});

test("없는 계약 id 는 404", async () => {
  const me = await createLandlordWithUnit();
  await loginAs(me.user.id);
  expect((await GET(req("nope"), ctx("nope"))).status).toBe(404);
  expect((await patch("nope", { deposit: 1 })).status).toBe(404);
});

test("타인 계약은 403 — 조회·수정 모두", async () => {
  const me = await createLandlordWithUnit("01011111111");
  const other = await createLandlordWithUnit("01099999999");
  const { lease } = await createLeaseWithCharge(other.unit.id);
  await loginAs(me.user.id);

  expect((await GET(req(lease.id), ctx(lease.id))).status).toBe(403);
  expect((await patch(lease.id, { deposit: 1 })).status).toBe(403);
});

test("계약 상세에 조건·호실·수납 요약이 담긴다", async () => {
  const me = await createLandlordWithUnit();
  const { lease, charge } = await createLeaseWithCharge(me.unit.id);
  await loginAs(me.user.id);

  const body = await (await GET(req(lease.id), ctx(lease.id))).json();
  expect(body.lease).toMatchObject({
    id: lease.id,
    status: "ACTIVE",
    tenantName: "박세입",
    monthlyRent: 650_000,
    maintenanceFee: 50_000,
    paymentDay: 5,
    lateFeeRatePct: 5,
  });
  expect(body.lease.unit).toMatchObject({ label: "201호", buildingName: "행당해피빌" });
  expect(body.lease.chargeSummary).toMatchObject({
    totalCount: 1,
    unpaidCount: 1,
    unpaidAmount: charge!.totalDue,
  });
});

test("계약 조건을 수정한다", async () => {
  const me = await createLandlordWithUnit();
  const { lease } = await createLeaseWithCharge(me.unit.id);
  await loginAs(me.user.id);

  const res = await patch(lease.id, {
    tenantName: "김세입",
    monthlyRent: 700_000,
    lateFeeRatePct: null,
  });
  expect(res.status).toBe(200);

  const saved = await prisma.lease.findUniqueOrThrow({ where: { id: lease.id } });
  expect(saved).toMatchObject({ tenantName: "김세입", monthlyRent: 700_000, lateFeeRatePct: null });
});

test("빈 본문은 400", async () => {
  const me = await createLandlordWithUnit();
  const { lease } = await createLeaseWithCharge(me.unit.id);
  await loginAs(me.user.id);
  expect((await patch(lease.id, {})).status).toBe(400);
});

test("수정으로 기간을 역전시키면 400", async () => {
  const me = await createLandlordWithUnit();
  const { lease } = await createLeaseWithCharge(me.unit.id);
  await loginAs(me.user.id);

  // 종료일만 시작일보다 앞으로 당긴다(저장된 시작일과 합쳐 판정한다)
  const res = await patch(lease.id, { endDate: "2020-01-01" });
  expect(res.status).toBe(400);
  expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
});

test("수정한 기간이 같은 호실의 다른 진행 중 계약과 겹치면 409", async () => {
  const me = await createLandlordWithUnit();
  const { lease } = await createLeaseWithCharge(me.unit.id); // 이번 달 ~ 1년
  const future = await prisma.lease.create({
    data: {
      unitId: me.unit.id,
      tenantName: "다음세입",
      tenantPhone: "01055555555",
      deposit: 0,
      monthlyRent: 500_000,
      maintenanceFee: 0,
      paymentDay: 1,
      startDate: utcDate(2030, 1, 1),
      endDate: utcDate(2030, 12, 31),
      status: "PENDING_TENANT",
    },
  });
  await loginAs(me.user.id);

  const res = await patch(lease.id, { endDate: "2030-06-30" });
  expect(res.status).toBe(409);
  // 자기 자신은 겹침 대상에서 빠지므로 기간을 그대로 두면 통과한다
  expect((await patch(lease.id, { tenantName: "그대로" })).status).toBe(200);
  expect(future.id).toBeTruthy();
});

test("계약 종료 — 종료일 이후 미납부 청구는 지우고 이미 발생한 미납은 남긴다", async () => {
  const me = await createLandlordWithUnit();
  const { lease } = await createLeaseWithCharge(me.unit.id, { withCharge: false });
  const { year, month } = kstYearMonth();
  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };

  // 지난 달 청구 — 이미 기한이 지난 미납이라 종료해도 남아야 한다
  const overdue = await prisma.rentCharge.create({
    data: {
      leaseId: lease.id,
      year: prev.year,
      month: prev.month,
      dueDate: utcDate(prev.year, prev.month, 5),
      rentAmount: 650_000,
      maintenanceAmount: 50_000,
      totalDue: 700_000,
      status: "OVERDUE",
    },
  });
  // 다음 달 청구(납부 기록 없음) — 종료일 이후라 지워져야 한다
  const future = await prisma.rentCharge.create({
    data: {
      leaseId: lease.id,
      year: next.year,
      month: next.month,
      dueDate: utcDate(next.year, next.month, 5),
      rentAmount: 650_000,
      maintenanceAmount: 50_000,
      totalDue: 700_000,
      status: "SCHEDULED",
    },
  });
  await loginAs(me.user.id);

  const res = await patch(lease.id, { status: "ENDED" });
  expect(res.status).toBe(200);
  const body = await res.json();

  expect(body.lease.status).toBe("ENDED");
  // 종료일은 오늘(KST)로 당겨진다
  expect(body.lease.endDate).toBe(kstToday().toISOString().slice(0, 10));
  expect(body.settlement).toMatchObject({
    removedScheduledCharges: 1,
    remainingUnpaidCount: 1,
    remainingUnpaidAmount: 700_000,
  });

  expect(await prisma.rentCharge.findUnique({ where: { id: future.id } })).toBeNull();
  // 이미 발생한 미납 청구는 그대로 남는다 — 계약이 끝나도 채권은 남는다
  expect(await prisma.rentCharge.findUnique({ where: { id: overdue.id } })).not.toBeNull();
});

test("계약 종료 — 납부 기록이 있는 청구는 종료일 이후여도 남긴다", async () => {
  const me = await createLandlordWithUnit();
  const { lease } = await createLeaseWithCharge(me.unit.id, { withCharge: false });
  const paid = await prisma.rentCharge.create({
    data: {
      leaseId: lease.id,
      year: 2030,
      month: 1,
      dueDate: utcDate(2030, 1, 5),
      rentAmount: 650_000,
      maintenanceAmount: 50_000,
      totalDue: 700_000,
      paidAmount: 700_000,
      status: "PAID",
    },
  });
  await addPayment(paid.id, 700_000);
  await loginAs(me.user.id);

  const body = await (await patch(lease.id, { status: "ENDED" })).json();
  expect(body.settlement.removedScheduledCharges).toBe(0);
  expect(await prisma.rentCharge.findUnique({ where: { id: paid.id } })).not.toBeNull();
});

test("계약 종료 — 고지서를 보낸 청구는 종료일 이후여도 남긴다", async () => {
  // MessageLog.chargeId 는 optional FK(SetNull) 라 청구를 지우면 이미 세입자에게
  // 나간 공개 고지서(T1.8)가 금액을 잃는다.
  const me = await createLandlordWithUnit();
  const { lease } = await createLeaseWithCharge(me.unit.id, { withCharge: false });
  const notified = await prisma.rentCharge.create({
    data: {
      leaseId: lease.id,
      year: 2030,
      month: 2,
      dueDate: utcDate(2030, 2, 5),
      rentAmount: 650_000,
      maintenanceAmount: 50_000,
      totalDue: 700_000,
      paidAmount: 0,
      status: "SCHEDULED",
    },
  });
  await prisma.messageLog.create({
    data: {
      kind: "RENT_NOTICE",
      toPhone: "01099990000",
      title: "2030년 2월 월세 고지서",
      body: "테스트 고지서",
      token: `end-notice-${notified.id}`,
      leaseId: lease.id,
      chargeId: notified.id,
    },
  });
  await loginAs(me.user.id);

  const body = await (await patch(lease.id, { status: "ENDED" })).json();
  expect(body.settlement.removedScheduledCharges).toBe(0);
  expect(await prisma.rentCharge.findUnique({ where: { id: notified.id } })).not.toBeNull();
});

test("이미 종료된 계약을 또 종료하면 409", async () => {
  const me = await createLandlordWithUnit();
  const { lease } = await createLeaseWithCharge(me.unit.id, { status: "ENDED" });
  await loginAs(me.user.id);

  const res = await patch(lease.id, { status: "ENDED" });
  expect(res.status).toBe(409);
  expect((await res.json()).error.code).toBe("CONFLICT");
});

test("ACTIVE 로 되돌리는 요청은 스키마가 막는다 — 400 (세입자 수락은 T1.3 소유)", async () => {
  const me = await createLandlordWithUnit();
  const { lease } = await createLeaseWithCharge(me.unit.id, { status: "PENDING_TENANT" });
  await loginAs(me.user.id);

  expect((await patch(lease.id, { status: "ACTIVE" })).status).toBe(400);
  const saved = await prisma.lease.findUniqueOrThrow({ where: { id: lease.id } });
  expect(saved.status).toBe("PENDING_TENANT");
});
