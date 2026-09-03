/**
 * `GET /api/admin/messages` 테스트 (T6.3) — 종류·수신자·열람 필터, OTP 본문 마스킹.
 */
import { MessageKind, prisma } from "@zari/db";
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
  return GET(new Request(`http://localhost/api/admin/messages${query}`));
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

test("계약에 안 걸린 발송(OTP)까지 전부 보인다 — 임대인 화면과 다른 점이다", async () => {
  await loginAdmin();
  await createLeaseScene();
  await prisma.messageLog.create({
    data: {
      kind: MessageKind.OTP,
      toPhone: "01044445555",
      title: "인증번호",
      body: "[자리톡] 인증번호 482913 을 입력해 주세요.",
    },
  });

  const body = await (await list("?pageSize=100")).json();
  expect(body.page.total).toBe(3);
});

test("OTP 본문의 인증번호는 가려서 온다 — 로그만 보고 남의 계정에 들어가지 못하게", async () => {
  await loginAdmin();
  await prisma.messageLog.create({
    data: {
      kind: MessageKind.OTP,
      toPhone: "01044445555",
      title: "인증번호",
      body: "[자리톡] 인증번호 482913 을 입력해 주세요.",
    },
  });

  const body = await (await list("?kind=OTP")).json();
  expect(body.messages[0].body).toBe("[자리톡] 인증번호 •••••• 을 입력해 주세요.");
  expect(JSON.stringify(body)).not.toContain("482913");
  expect(body.messages[0].toPhone).toBe("010-****-5555");
});

test("고지서 본문은 가리지 않는다 — 무엇을 보냈는지 확인하는 화면이다", async () => {
  await loginAdmin();
  await createLeaseScene();

  const body = await (await list("?kind=RENT_NOTICE")).json();
  expect(body.messages[0].body).toBe("[자리톡] 월세 고지서입니다.");
  expect(body.messages[0]).toMatchObject({
    kindLabel: "월세 고지서",
    buildingName: "행당해피빌",
    unitLabel: "201호",
    tenantName: "박세입",
    opened: true,
  });
  expect(body.messages[0].noticePath).toMatch(/^\/notice\//);
});

test("종류 필터 · 종류별 건수는 종류 필터를 빼고 센다", async () => {
  await loginAdmin();
  await createLeaseScene();

  const body = await (await list("?kind=OVERDUE_NOTICE")).json();
  expect(body.page.total).toBe(1);
  const byKind = Object.fromEntries(
    body.kindCounts.map((row: { kind: string; count: number }) => [row.kind, row.count]),
  );
  expect(byKind).toMatchObject({ RENT_NOTICE: 1, OVERDUE_NOTICE: 1, OTP: 0 });
});

test("열람 여부 필터", async () => {
  await loginAdmin();
  await createLeaseScene();

  expect((await (await list("?opened=opened")).json()).page.total).toBe(1);
  expect((await (await list("?opened=unopened")).json()).page.total).toBe(1);
  expect((await (await list("?opened=all")).json()).page.total).toBe(2);
  expect((await list("?opened=nope")).status).toBe(400);

  const all = await (await list()).json();
  expect(all).toMatchObject({ openedCount: 1, unopenedCount: 1 });
});

test("수신 번호 필터 — 하이픈을 넣어도 찾힌다", async () => {
  await loginAdmin();
  await createLeaseScene();
  await prisma.messageLog.create({
    data: { kind: MessageKind.OTP, toPhone: "01044445555", title: "인증번호", body: "482913" },
  });

  expect((await (await list("?q=2222")).json()).page.total).toBe(2);
  expect((await (await list("?q=010-4444-5555")).json()).page.total).toBe(1);
  expect((await (await list("?q=%25")).json()).page.total).toBe(0);
});

test("최신 발송이 먼저 오고, 페이지를 이어 붙이면 전체와 같다", async () => {
  await loginAdmin();
  await createLeaseScene();

  const all = await (await list("?pageSize=100")).json();
  expect(all.messages[0].title).toContain("연체 안내");

  const collected: string[] = [];
  for (let page = 1; page <= 2; page += 1) {
    const body = await (await list(`?page=${page}&pageSize=1`)).json();
    collected.push(...body.messages.map((message: { id: string }) => message.id));
  }
  expect(collected).toEqual(all.messages.map((message: { id: string }) => message.id));
});
