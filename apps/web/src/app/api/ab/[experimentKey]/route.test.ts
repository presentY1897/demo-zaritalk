/**
 * `GET /api/ab/[experimentKey]` 테스트 (T6.1).
 */
import { prisma } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import { EXPERIMENTS } from "@/features/ab/experiments";
import { variantFor } from "@/features/ab/hash";
import { loginAs } from "@/features/landlord/testing";
import { NOTICE_CTA_EXPERIMENT } from "@/features/notice/cta";
import { resetTestCookies } from "@/lib/auth/testing";
import { ANON_ID_COOKIE } from "@/lib/tracking/anon-id";
import { GET } from "./route";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

const ANON = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const NOTICE_CTA = EXPERIMENTS[NOTICE_CTA_EXPERIMENT];
if (!NOTICE_CTA) throw new Error("notice_cta 실험이 등록돼 있어야 한다");

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
});

function call(key: string, anonId?: string) {
  return GET(
    new Request(`http://localhost/api/ab/${key}`, {
      headers: anonId ? { cookie: `${ANON_ID_COOKIE}=${anonId}` } : undefined,
    }),
    { params: Promise.resolve({ experimentKey: key }) },
  );
}

test("배정을 돌려주고 실험 정의도 함께 실어 보낸다", async () => {
  const response = await call(NOTICE_CTA_EXPERIMENT, ANON);
  expect(response.status).toBe(200);

  const body = await response.json();
  expect(body.experiment.key).toBe(NOTICE_CTA_EXPERIMENT);
  expect(body.experiment.variants.map((v: { key: string }) => v.key)).toEqual(["A", "B"]);
  expect(body.assignment.anonId).toBe(ANON);
  expect(body.assignment.variant).toBe(
    variantFor(ANON, NOTICE_CTA_EXPERIMENT, NOTICE_CTA.variants),
  );
  expect(body.assignment.created).toBe(true);
  expect(body.assignment.userId).toBeNull();
});

test("같은 쿠키로 다시 부르면 같은 변형 (created 만 false)", async () => {
  const first = await (await call(NOTICE_CTA_EXPERIMENT, ANON)).json();
  const second = await (await call(NOTICE_CTA_EXPERIMENT, ANON)).json();

  expect(second.assignment.variant).toBe(first.assignment.variant);
  expect(second.assignment.created).toBe(false);
  expect(await prisma.abAssignment.count()).toBe(1);
});

test("anonId 쿠키가 없으면 서버가 발급하고 Set-Cookie 로 심는다", async () => {
  const response = await call(NOTICE_CTA_EXPERIMENT);
  const body = await response.json();

  expect(body.assignment.anonId).toMatch(/^[0-9a-f]{32}$/);
  expect(response.headers.get("set-cookie")).toContain(`${ANON_ID_COOKIE}=${body.assignment.anonId}`);
});

test("쿠키가 있으면 Set-Cookie 를 다시 굽지 않는다", async () => {
  const response = await call(NOTICE_CTA_EXPERIMENT, ANON);
  expect(response.headers.get("set-cookie")).toBeNull();
});

test("로그인 상태로 부르면 배정에 userId 가 붙는다", async () => {
  const user = await prisma.user.create({ data: { phone: "01011112222", name: "홍미가" } });
  await loginAs(user.id);

  const body = await (await call(NOTICE_CTA_EXPERIMENT, ANON)).json();
  expect(body.assignment.userId).toBe(user.id);
  expect((await prisma.abAssignment.findFirst())?.userId).toBe(user.id);
});

test("없는 실험 키는 404", async () => {
  const response = await call("no_such_experiment", ANON);
  expect(response.status).toBe(404);
  expect((await response.json()).error.code).toBe("NOT_FOUND");
  expect(await prisma.abAssignment.count()).toBe(0);
});

test("형식이 아닌 실험 키도 404 (DB 를 건드리지 않는다)", async () => {
  expect((await call("Notice-CTA", ANON)).status).toBe(404);
  expect(await prisma.abAssignment.count()).toBe(0);
});

test("비로그인도 열린다 — 실험 대상이 미가입 방문자다", async () => {
  expect((await call(NOTICE_CTA_EXPERIMENT, ANON)).status).toBe(200);
});
