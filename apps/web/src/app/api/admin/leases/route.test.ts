/**
 * `GET /api/admin/leases` 테스트 (T6.3) — 상태 필터 · 연체 드릴다운 · 페이지네이션.
 */
import { LeaseStatus, prisma } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import {
  createAdminUser,
  createLeaseScene,
  createPlainUser,
  loginAs,
} from "@/features/admin/testing";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { resetTestCookies, setTestCookie } from "@/lib/auth/testing";
import { GET } from "./route";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
});

function list(query = ""): Promise<Response> {
  return GET(new Request(`http://localhost/api/admin/leases${query}`));
}

async function loginAdmin() {
  const admin = await createAdminUser();
  setTestCookie(SESSION_COOKIE, await loginAs(admin.id));
}

test("비로그인 401 · 비어드민 403", async () => {
  expect((await list()).status).toBe(401);
  const plain = await createPlainUser();
  setTestCookie(SESSION_COOKIE, await loginAs(plain.id));
  expect((await list()).status).toBe(403);
});

test("연체 요약은 원장 엔진이 판정한다 — 저장 상태(OVERDUE)와 엔진 판정(부분납 포함)이 함께 온다", async () => {
  await loginAdmin();
  await createLeaseScene();

  const body = await (await list()).json();
  expect(body.leases).toHaveLength(1);
  expect(body.leases[0]).toMatchObject({
    buildingName: "행당해피빌",
    unitLabel: "201호",
    tenantPhone: "010-****-2222",
    tenantLinked: true,
    chargeCount: 3,
    // 저장된 상태가 OVERDUE 인 청구는 1건
    overdueCount: 1,
    // 엔진은 부분납(7월)까지 "기한 경과 미납" 으로 센다 — 두 숫자는 뜻이 다르다
    delinquentCount: 2,
    outstandingAmount: 1_015_500 + 300_000,
  });
  expect(body.leases[0].maxOverdueDays).toBeGreaterThan(0);
});

test("상태 필터 — 탭 건수는 상태 필터를 빼고 센다", async () => {
  await loginAdmin();
  await createLeaseScene();
  await createLeaseScene({
    landlordPhone: "01099999999",
    tenantPhone: "01066666666",
    unitLabel: "301호",
    status: LeaseStatus.ENDED,
  });

  const active = await (await list("?status=ACTIVE")).json();
  expect(active.page.total).toBe(1);
  expect(active.leases[0].status).toBe("ACTIVE");
  // 필터를 걸어도 옆 탭 숫자는 그대로다
  expect(active.counts).toMatchObject({ ACTIVE: 1, ENDED: 1, PENDING_TENANT: 0, CANCELLED: 0 });

  const both = await (await list("?status=ACTIVE,ENDED")).json();
  expect(both.page.total).toBe(2);

  // 모르는 값은 버린다 — 필터가 없는 것과 같다
  expect((await (await list("?status=NOPE")).json()).page.total).toBe(2);
});

test("연체 드릴다운 — 연체 청구가 있는 계약만", async () => {
  await loginAdmin();
  const withOverdue = await createLeaseScene();
  const clean = await createLeaseScene({
    landlordPhone: "01099999999",
    tenantPhone: "01066666666",
    unitLabel: "301호",
  });
  await prisma.rentCharge.updateMany({
    where: { leaseId: clean.lease.id },
    data: { status: "PAID", paidAmount: 1_015_500 },
  });

  const body = await (await list("?overdue=1")).json();
  expect(body.leases.map((lease: { id: string }) => lease.id)).toEqual([withOverdue.lease.id]);
  expect(body.overdueTotal).toBe(1);
});

test("검색 — 세입자 이름·전화·호실·건물명", async () => {
  await loginAdmin();
  await createLeaseScene();
  await createLeaseScene({
    landlordPhone: "01099999999",
    tenantPhone: "01066666666",
    tenantName: "이세입",
    buildingName: "왕십리팰리스",
    unitLabel: "301호",
  });

  expect((await (await list("?q=이세입")).json()).page.total).toBe(1);
  expect((await (await list("?q=6666")).json()).page.total).toBe(1);
  expect((await (await list("?q=301")).json()).page.total).toBe(1);
  expect((await (await list("?q=왕십리")).json()).page.total).toBe(1);
  expect((await (await list("?q=%25")).json()).page.total).toBe(0);
});

test("페이지네이션 경계 — 페이지를 이어 붙이면 전체와 같다", async () => {
  await loginAdmin();
  for (let i = 0; i < 5; i += 1) {
    await createLeaseScene({
      landlordPhone: `0101111${String(i).padStart(4, "0")}`,
      tenantPhone: `0102222${String(i).padStart(4, "0")}`,
      unitLabel: `${i}01호`,
    });
  }

  const all = await (await list("?pageSize=100")).json();
  expect(all.page.total).toBe(5);

  const collected: string[] = [];
  for (let page = 1; page <= 3; page += 1) {
    const body = await (await list(`?page=${page}&pageSize=2`)).json();
    collected.push(...body.leases.map((lease: { id: string }) => lease.id));
  }
  expect(new Set(collected).size).toBe(5);
  expect(collected).toEqual(all.leases.map((lease: { id: string }) => lease.id));
});
