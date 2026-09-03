/**
 * `GET /api/admin/users/[id]` 회원 상세 테스트 (T6.3).
 * 프로필·계약(양쪽 역할)·이력 타임라인이 한 응답에 모이는지 본다.
 */
import { prisma, RefundStatus } from "@zari/db";
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

function detail(id: string): Promise<Response> {
  return GET(new Request(`http://localhost/api/admin/users/${id}`), {
    params: Promise.resolve({ id }),
  });
}

async function loginAdmin() {
  const admin = await createAdminUser();
  setTestCookie(SESSION_COOKIE, await loginAs(admin.id));
  return admin;
}

test("비로그인 401 · 비어드민 403 · 없는 회원 404", async () => {
  expect((await detail("nope")).status).toBe(401);

  const plain = await createPlainUser();
  setTestCookie(SESSION_COOKIE, await loginAs(plain.id));
  expect((await detail(plain.id)).status).toBe(403);

  resetTestCookies();
  await loginAdmin();
  expect((await detail("does-not-exist")).status).toBe(404);
});

test("세입자 상세 — 프로필·계약·타임라인이 함께 온다", async () => {
  await loginAdmin();
  const scene = await createLeaseScene();
  await prisma.refundApplication.create({
    data: {
      tenantProfileId: scene.tenantProfile.id,
      leaseId: scene.lease.id,
      annualIncome: 45_000_000,
      startYear: 2024,
      endYear: 2026,
      expectedAmount: 1_200_000,
      status: RefundStatus.SUBMITTED,
      submittedAt: new Date("2026-08-25T00:00:00Z"),
    },
  });

  const body = await (await detail(scene.tenant.id)).json();

  expect(body.user).toMatchObject({ name: "박세입", phone: "010-****-2222" });
  expect(body.profiles).toHaveLength(1);
  expect(body.profiles[0]).toMatchObject({ type: "TENANT" });

  expect(body.leases).toHaveLength(1);
  expect(body.leases[0]).toMatchObject({
    role: "TENANT",
    buildingName: "행당해피빌",
    unitLabel: "201호",
    counterpartName: "김임대",
    statusLabel: "계약중",
  });

  const kinds = body.timeline.map((entry: { kind: string }) => entry.kind);
  expect(kinds).toContain("SIGNUP");
  expect(kinds).toContain("PROFILE");
  expect(kinds).toContain("LEASE");
  expect(kinds).toContain("REFUND");
  expect(kinds).toContain("MESSAGE");
});

test("타임라인은 최신순이다", async () => {
  await loginAdmin();
  const scene = await createLeaseScene();

  const body = await (await detail(scene.tenant.id)).json();
  const times = body.timeline.map((entry: { at: string }) => entry.at);
  expect(times).toEqual([...times].sort().reverse());
  // 발송(2026-08)은 가입("지금")보다 과거다 — 정렬은 시각이 정하지 종류가 정하지 않는다
  const signupAt = body.timeline.find((entry: { kind: string }) => entry.kind === "SIGNUP").at;
  const messageAt = body.timeline.find((entry: { kind: string }) => entry.kind === "MESSAGE").at;
  expect(signupAt > messageAt).toBe(true);
  expect(body.timelineTruncated).toBe(false);
});

test("임대인 상세에서는 같은 계약이 LANDLORD 역할로 보인다", async () => {
  await loginAdmin();
  const scene = await createLeaseScene();

  const body = await (await detail(scene.landlord.id)).json();
  expect(body.leases).toHaveLength(1);
  expect(body.leases[0]).toMatchObject({ role: "LANDLORD", counterpartName: "박세입" });
});
