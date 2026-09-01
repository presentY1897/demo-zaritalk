import { LeaseStatus } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import { loginAs } from "@/features/landlord/testing";
import { createLandlordWithUnit } from "@/features/lease/testing";
import { createPendingLease, createTenant, TENANT_PHONE } from "@/features/tenant/testing";
import { resetTestCookies } from "@/lib/auth/testing";
import { GET } from "./route";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
});

test("비로그인이면 401", async () => {
  expect((await GET()).status).toBe(401);
});

test("세입자 프로필이 없으면 403", async () => {
  const landlord = await createLandlordWithUnit();
  await loginAs(landlord.user.id);
  const response = await GET();
  expect(response.status).toBe(403);
  expect((await response.json()).error.code).toBe("FORBIDDEN");
});

test("내 번호로 등록된 대기 계약만 나온다", async () => {
  const landlord = await createLandlordWithUnit("01011111111", ["201호", "202호"]);
  const mine = await createPendingLease(landlord.units[0]!.id, { tenantPhone: TENANT_PHONE });
  await createPendingLease(landlord.units[1]!.id, { tenantPhone: "01099999999" });

  const tenant = await createTenant(TENANT_PHONE);
  await loginAs(tenant.user.id);

  const body = await (await GET()).json();
  expect(body.leases).toHaveLength(1);
  expect(body.leases[0]).toMatchObject({
    id: mine.id,
    status: "PENDING_TENANT",
    tenantProfileId: null,
    landlordName: "김임대",
  });
  expect(body.leases[0].unit).toMatchObject({ label: "201호", buildingName: "행당해피빌" });
});

test("이미 수락했거나 취소된 계약은 대기 목록에 없다", async () => {
  const landlord = await createLandlordWithUnit("01011111111", ["201호", "202호", "101호"]);
  const tenant = await createTenant(TENANT_PHONE);

  await createPendingLease(landlord.units[0]!.id, {
    status: LeaseStatus.ACTIVE,
    tenantProfileId: tenant.profile.id,
  });
  await createPendingLease(landlord.units[1]!.id, { status: LeaseStatus.CANCELLED });
  const pending = await createPendingLease(landlord.units[2]!.id);

  await loginAs(tenant.user.id);
  const body = await (await GET()).json();
  expect(body.leases.map((lease: { id: string }) => lease.id)).toEqual([pending.id]);
});

test("내 번호에 하이픈이 섞여 있어도 정규화해서 매칭한다", async () => {
  const landlord = await createLandlordWithUnit();
  const lease = await createPendingLease(landlord.unit.id, { tenantPhone: TENANT_PHONE });

  // 저장된 계약 번호는 정규화된 숫자, 계정 번호는 하이픈이 남은 값
  const tenant = await createTenant("010-5555-5555");
  await loginAs(tenant.user.id);

  const body = await (await GET()).json();
  expect(body.leases.map((item: { id: string }) => item.id)).toEqual([lease.id]);
});

test("대기 계약이 없으면 빈 배열", async () => {
  const tenant = await createTenant(TENANT_PHONE);
  await loginAs(tenant.user.id);
  const body = await (await GET()).json();
  expect(body.leases).toEqual([]);
});
