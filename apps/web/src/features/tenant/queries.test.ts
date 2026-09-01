import { LeaseStatus } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test } from "vitest";
import { createLandlordWithUnit } from "@/features/lease/testing";
import { kstYearMonth, previousMonth } from "@/lib/rent";
import { getTenantHome, listPendingLeases } from "./queries";
import { addCharge, createPendingLease, createTenant, TENANT_PHONE } from "./testing";

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
});

test("수락 전에는 계약 카드가 없고 대기 건수만 잡힌다", async () => {
  const landlord = await createLandlordWithUnit();
  await createPendingLease(landlord.unit.id);
  const tenant = await createTenant(TENANT_PHONE);

  const home = await getTenantHome(tenant.profile.id, tenant.user.phone);
  expect(home.pendingCount).toBe(1);
  expect(home.leases).toHaveLength(0);
  expect(home.outstanding).toEqual({ count: 0, amount: 0 });
});

test("수락한 계약은 이번 달 청구·최근 청구·미납 합계와 함께 보인다", async () => {
  const landlord = await createLandlordWithUnit();
  const tenant = await createTenant(TENANT_PHONE);
  const lease = await createPendingLease(landlord.unit.id, {
    status: LeaseStatus.ACTIVE,
    tenantProfileId: tenant.profile.id,
    startDate: "2020-01-01",
  });
  const current = kstYearMonth();
  await addCharge(lease, previousMonth(current), { paidAmount: 700_000 }); // 완납
  await addCharge(lease, current); // 미납

  const home = await getTenantHome(tenant.profile.id, tenant.user.phone);
  expect(home.pendingCount).toBe(0);
  expect(home.leases).toHaveLength(1);

  const card = home.leases[0]!;
  expect(card.lease.landlordName).toBe("김임대");
  expect(card.currentCharge).toMatchObject({ year: current.year, month: current.month });
  expect(card.charges).toHaveLength(2);
  // 미납은 이번 달 700,000 한 건뿐 (전월은 완납)
  expect(home.outstanding).toEqual({ count: 1, amount: 700_000 });
});

test("다른 세입자에게 연결된 계약은 내 홈에 보이지 않는다", async () => {
  const landlord = await createLandlordWithUnit("01011111111", ["201호", "202호"]);
  const me = await createTenant(TENANT_PHONE);
  const other = await createTenant("01077777777", "다른세입");

  await createPendingLease(landlord.units[0]!.id, {
    status: LeaseStatus.ACTIVE,
    tenantProfileId: other.profile.id,
    tenantPhone: TENANT_PHONE, // 번호는 같아도 연결된 계정이 다르다
  });

  const home = await getTenantHome(me.profile.id, me.user.phone);
  expect(home.leases).toHaveLength(0);
  expect(home.pendingCount).toBe(0);
});

test("종료된 계약도 내 계약 카드로 남는다(남은 미납이 정산 대상이라)", async () => {
  const landlord = await createLandlordWithUnit();
  const tenant = await createTenant(TENANT_PHONE);
  const lease = await createPendingLease(landlord.unit.id, {
    status: LeaseStatus.ENDED,
    tenantProfileId: tenant.profile.id,
    startDate: "2020-01-01",
  });
  await addCharge(lease, previousMonth(kstYearMonth()));

  const home = await getTenantHome(tenant.profile.id, tenant.user.phone);
  expect(home.leases).toHaveLength(1);
  expect(home.leases[0]!.lease.status).toBe("ENDED");
  expect(home.leases[0]!.currentCharge).toBeNull();
  expect(home.outstanding.count).toBe(1);
});

test("대기 계약 목록은 오래된 순으로 나온다", async () => {
  const landlord = await createLandlordWithUnit("01011111111", ["201호", "202호"]);
  const first = await createPendingLease(landlord.units[0]!.id);
  const second = await createPendingLease(landlord.units[1]!.id);

  const leases = await listPendingLeases(TENANT_PHONE);
  expect(leases.map((lease) => lease.id)).toEqual([first.id, second.id]);
});
