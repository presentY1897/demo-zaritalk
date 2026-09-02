/**
 * `POST /api/quotes/[id]/accept` 테스트 (T5.3) — **수락 트랜잭션의 원자성**.
 *
 * task 최소 테스트 중 **②수락 트랜잭션 원자성(나머지 전부 REJECTED)** 이 여기 있다.
 * 롤백(중간 실패)은 `features/workorder/quotes.test.ts` 가 트랜잭션 경계에서 직접 확인한다.
 */
import { prisma, QuoteStatus, WorkOrderStatus } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import { createLandlord, loginAs } from "@/features/landlord/testing";
import {
  addQuote,
  addWorkOrder,
  addWorkOrderTarget,
  createMaster,
  createWorkOrderScene,
} from "@/features/workorder/testing";
import { resetTestCookies } from "@/lib/auth/testing";
import { POST } from "./route";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
});

const accept = (id: string) =>
  POST(new Request(`http://localhost/api/quotes/${id}/accept`, { method: "POST" }), {
    params: Promise.resolve({ id }),
  });

/** 임대인 1 · 의뢰 1 · 마스터 3 · 견적 3 (금액 15만 / 18만 / 22만) */
async function sceneWithThreeQuotes() {
  const scene = await createWorkOrderScene();
  const order = await addWorkOrder(scene);
  const cheap = await createMaster("01044444444", { companyName: "성수홈케어" });
  const mid = await createMaster("01066666666", { companyName: "왕십리설비" });
  const pricey = await createMaster("01077777777", { companyName: "행당보일러" });

  const quotes = {
    cheap: await addQuote(order.id, cheap.profile.id, { amount: 150_000 }),
    mid: await addQuote(order.id, mid.profile.id, { amount: 180_000 }),
    pricey: await addQuote(order.id, pricey.profile.id, { amount: 220_000 }),
  };
  return { scene, order, masters: { cheap, mid, pricey }, quotes };
}

test("비로그인이면 401", async () => {
  expect((await accept("cmf0")).status).toBe(401);
});

test("임대인 프로필이 없으면 403 (마스터 계정)", async () => {
  const master = await createMaster("01044444444");
  await loginAs(master.user.id);
  expect((await accept("cmf0")).status).toBe(403);
});

test("없는 견적은 404", async () => {
  const landlord = await createLandlord();
  await loginAs(landlord.user.id);
  expect((await accept("cmf0notexist")).status).toBe(404);
});

test("남의 의뢰에 달린 견적은 403 — 아무 것도 바뀌지 않는다", async () => {
  const { order, quotes } = await sceneWithThreeQuotes();
  const other = await createLandlord("01099999999", "남임대");

  await loginAs(other.user.id);
  expect((await accept(quotes.mid.id)).status).toBe(403);

  const after = await prisma.workOrder.findUniqueOrThrow({ where: { id: order.id } });
  expect(after.status).toBe(WorkOrderStatus.REQUESTED);
  const statuses = await prisma.workOrderQuote.findMany({ where: { workOrderId: order.id } });
  expect(statuses.every((quote) => quote.status === QuoteStatus.PROPOSED)).toBe(true);
});

test("**수락 1건 + 나머지 전부 REJECTED + 의뢰 ASSIGNED 가 한 덩어리다**", async () => {
  const { scene, order, quotes } = await sceneWithThreeQuotes();
  await loginAs(scene.user.id);

  const response = await accept(quotes.mid.id);
  expect(response.status).toBe(200);

  const body = await response.json();
  expect(body.acceptedQuoteId).toBe(quotes.mid.id);
  expect(body.workOrder.status).toBe("ASSIGNED");
  expect(body.quotes).toHaveLength(3);

  // ① 수락은 정확히 하나
  const rows = await prisma.workOrderQuote.findMany({
    where: { workOrderId: order.id },
    orderBy: { amount: "asc" },
  });
  expect(rows.filter((quote) => quote.status === QuoteStatus.ACCEPTED)).toHaveLength(1);
  expect(rows.find((quote) => quote.id === quotes.mid.id)?.status).toBe(QuoteStatus.ACCEPTED);

  // ② 나머지는 **전부** 거절
  expect(rows.filter((quote) => quote.status === QuoteStatus.REJECTED).map((q) => q.id).sort()).toEqual(
    [quotes.cheap.id, quotes.pricey.id].sort(),
  );

  // ③ 의뢰는 배정
  const after = await prisma.workOrder.findUniqueOrThrow({ where: { id: order.id } });
  expect(after.status).toBe(WorkOrderStatus.ASSIGNED);
});

test("응답의 견적 목록은 수락된 것이 맨 위 — 화면이 다시 묻지 않는다", async () => {
  const { scene, quotes } = await sceneWithThreeQuotes();
  await loginAs(scene.user.id);

  const body = await (await accept(quotes.pricey.id)).json();
  expect(body.quotes[0].id).toBe(quotes.pricey.id);
  expect(body.quotes[0].status).toBe("ACCEPTED");
  // 나머지는 금액이 싼 순
  expect(body.quotes.slice(1).map((quote: { amount: number }) => quote.amount)).toEqual([
    150_000, 180_000,
  ]);
});

test("견적이 하나뿐이어도 수락된다 — 거절할 나머지가 없을 뿐", async () => {
  const scene = await createWorkOrderScene();
  const order = await addWorkOrder(scene);
  const master = await createMaster("01044444444");
  const quote = await addQuote(order.id, master.profile.id);

  await loginAs(scene.user.id);
  const body = await (await accept(quote.id)).json();
  expect(body.workOrder.status).toBe("ASSIGNED");
  expect(body.quotes).toHaveLength(1);
  expect(body.quotes[0].status).toBe("ACCEPTED");
});

test("**이미 수락된 견적을 다시 수락하면 409** — 상태는 그대로", async () => {
  const { scene, order, quotes } = await sceneWithThreeQuotes();
  await loginAs(scene.user.id);
  expect((await accept(quotes.mid.id)).status).toBe(200);

  const again = await accept(quotes.mid.id);
  expect(again.status).toBe(409);

  const rows = await prisma.workOrderQuote.findMany({ where: { workOrderId: order.id } });
  expect(rows.filter((quote) => quote.status === QuoteStatus.ACCEPTED)).toHaveLength(1);
});

test("이미 배정된 의뢰의 **다른** 견적을 수락하면 409 — 수락은 여전히 하나뿐", async () => {
  const { scene, order, quotes } = await sceneWithThreeQuotes();
  await loginAs(scene.user.id);
  expect((await accept(quotes.mid.id)).status).toBe(200);

  const other = await accept(quotes.cheap.id);
  expect(other.status).toBe(409);

  const rows = await prisma.workOrderQuote.findMany({ where: { workOrderId: order.id } });
  expect(rows.filter((quote) => quote.status === QuoteStatus.ACCEPTED).map((q) => q.id)).toEqual([
    quotes.mid.id,
  ]);
  // 거절됐던 견적이 되살아나지도 않는다
  expect(rows.find((quote) => quote.id === quotes.cheap.id)?.status).toBe(QuoteStatus.REJECTED);
});

test("**동시 수락 요청 2건 → 하나만 성공한다**", async () => {
  const { scene, order, quotes } = await sceneWithThreeQuotes();
  await loginAs(scene.user.id);

  const [first, second] = await Promise.all([accept(quotes.cheap.id), accept(quotes.mid.id)]);
  const codes = [first.status, second.status].sort();
  expect(codes).toEqual([200, 409]);

  // 최종 상태는 어느 쪽이 이겼든 일관적이다 — 수락 1 · 거절 2 · 의뢰 ASSIGNED
  const rows = await prisma.workOrderQuote.findMany({ where: { workOrderId: order.id } });
  expect(rows.filter((quote) => quote.status === QuoteStatus.ACCEPTED)).toHaveLength(1);
  expect(rows.filter((quote) => quote.status === QuoteStatus.REJECTED)).toHaveLength(2);
  expect(rows.filter((quote) => quote.status === QuoteStatus.PROPOSED)).toHaveLength(0);

  const after = await prisma.workOrder.findUniqueOrThrow({ where: { id: order.id } });
  expect(after.status).toBe(WorkOrderStatus.ASSIGNED);
});

test("완료·취소된 의뢰의 견적은 수락할 수 없다 — 409", async () => {
  const scene = await createWorkOrderScene();
  const done = await addWorkOrder(scene, { status: WorkOrderStatus.DONE });
  const cancelled = await addWorkOrder(scene, { status: WorkOrderStatus.CANCELLED });
  const master = await createMaster("01044444444");
  const doneQuote = await addQuote(done.id, master.profile.id);
  const cancelledQuote = await addQuote(cancelled.id, master.profile.id);

  await loginAs(scene.user.id);
  expect((await accept(doneQuote.id)).status).toBe(409);
  expect((await accept(cancelledQuote.id)).status).toBe(409);
  expect(
    await prisma.workOrderQuote.count({ where: { status: QuoteStatus.PROPOSED } }),
  ).toBe(2);
});

test("이미 거절된 견적은 되살릴 수 없다 — 409", async () => {
  const scene = await createWorkOrderScene();
  const order = await addWorkOrder(scene);
  const master = await createMaster("01044444444");
  const quote = await addQuote(order.id, master.profile.id, { status: QuoteStatus.REJECTED });

  await loginAs(scene.user.id);
  expect((await accept(quote.id)).status).toBe(409);
  const after = await prisma.workOrderQuote.findUniqueOrThrow({ where: { id: quote.id } });
  expect(after.status).toBe(QuoteStatus.REJECTED);
});

test("다른 의뢰의 견적은 이번 수락에 휘말리지 않는다", async () => {
  const { scene, quotes } = await sceneWithThreeQuotes();
  const otherOrder = await addWorkOrder(scene);
  const master = await createMaster("01088888888");
  const untouched = await addQuote(otherOrder.id, master.profile.id);

  await loginAs(scene.user.id);
  expect((await accept(quotes.mid.id)).status).toBe(200);

  const after = await prisma.workOrderQuote.findUniqueOrThrow({ where: { id: untouched.id } });
  expect(after.status).toBe(QuoteStatus.PROPOSED);
  const otherAfter = await prisma.workOrder.findUniqueOrThrow({ where: { id: otherOrder.id } });
  expect(otherAfter.status).toBe(WorkOrderStatus.REQUESTED);
});

test("응답 견적에 push/pull 이 실려 온다", async () => {
  const scene = await createWorkOrderScene();
  const order = await addWorkOrder(scene);
  const pushed = await createMaster("01044444444");
  const pulled = await createMaster("01066666666");
  await addWorkOrderTarget(order.id, pushed.profile.id, 2.554);
  const pushedQuote = await addQuote(order.id, pushed.profile.id, { amount: 200_000 });
  await addQuote(order.id, pulled.profile.id, { amount: 150_000 });

  await loginAs(scene.user.id);
  const body = await (await accept(pushedQuote.id)).json();
  const sources = Object.fromEntries(
    body.quotes.map((quote: { id: string; source: string }) => [quote.id, quote.source]),
  );
  expect(sources[pushedQuote.id]).toBe("PUSH");
  expect(Object.values(sources)).toContain("PULL");
});
