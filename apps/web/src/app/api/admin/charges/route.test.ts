/**
 * `GET /api/admin/charges` 테스트 (T6.3) — 상태·연월 필터, 계약 드릴다운, 엔진 판정값.
 */
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
  return GET(new Request(`http://localhost/api/admin/charges${query}`));
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

test("행마다 원장 엔진이 판정한 미납액·연체일수·연체 여부가 붙는다", async () => {
  await loginAdmin();
  await createLeaseScene();

  const body = await (await list("?status=OVERDUE")).json();
  expect(body.charges).toHaveLength(1);
  expect(body.charges[0]).toMatchObject({
    year: 2026,
    month: 8,
    statusLabel: "연체",
    outstanding: 1_015_500,
    delinquent: true,
    tenantPhone: "010-****-2222",
    buildingName: "행당해피빌",
  });
  expect(body.charges[0].overdueDays).toBeGreaterThan(0);
  expect(body.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test("완납 청구는 기한이 지나도 연체가 아니다", async () => {
  await loginAdmin();
  await createLeaseScene();

  const body = await (await list("?status=PAID")).json();
  expect(body.charges[0]).toMatchObject({ outstanding: 0, delinquent: false });
});

test("부분납은 저장 상태가 PARTIALLY_PAID 지만 엔진은 연체로 본다", async () => {
  await loginAdmin();
  await createLeaseScene();

  const body = await (await list("?status=PARTIALLY_PAID")).json();
  expect(body.charges[0]).toMatchObject({
    status: "PARTIALLY_PAID",
    outstanding: 300_000,
    delinquent: true,
  });
});

test("상태 탭 건수는 상태 필터를 빼고 센다", async () => {
  await loginAdmin();
  await createLeaseScene();

  const body = await (await list("?status=OVERDUE")).json();
  expect(body.page.total).toBe(1);
  expect(body.counts).toEqual({ PAID: 1, PARTIALLY_PAID: 1, OVERDUE: 1, SCHEDULED: 0 });
});

test("연·월 필터", async () => {
  await loginAdmin();
  await createLeaseScene();

  expect((await (await list("?year=2026&month=7")).json()).page.total).toBe(1);
  expect((await (await list("?year=2026")).json()).page.total).toBe(3);
  expect((await (await list("?year=2025")).json()).page.total).toBe(0);
  expect((await list("?month=13")).status).toBe(400);
});

test("계약 드릴다운 — 그 계약의 청구만 + 계약 요약이 함께 온다", async () => {
  await loginAdmin();
  const mine = await createLeaseScene();
  await createLeaseScene({
    landlordPhone: "01099999999",
    tenantPhone: "01066666666",
    unitLabel: "301호",
  });

  const body = await (await list(`?leaseId=${mine.lease.id}`)).json();
  expect(body.page.total).toBe(3);
  expect(body.lease).toMatchObject({ id: mine.lease.id, unitLabel: "201호" });

  const unknown = await (await list("?leaseId=does-not-exist")).json();
  expect(unknown.page.total).toBe(0);
  expect(unknown.lease).toBeNull();
});

test("페이지네이션 — 납부기한 최신순으로 잘리고 이어 붙이면 전체와 같다", async () => {
  await loginAdmin();
  await createLeaseScene();

  const all = await (await list("?pageSize=100")).json();
  const collected: string[] = [];
  for (let page = 1; page <= 3; page += 1) {
    const body = await (await list(`?page=${page}&pageSize=1`)).json();
    expect(body.page).toMatchObject({ total: 3, totalPages: 3 });
    collected.push(...body.charges.map((charge: { id: string }) => charge.id));
  }
  expect(collected).toEqual(all.charges.map((charge: { id: string }) => charge.id));
  expect(new Set(collected).size).toBe(3);
});
