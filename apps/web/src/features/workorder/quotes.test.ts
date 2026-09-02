/**
 * 견적 조회·DTO + **수락 트랜잭션의 롤백** 테스트 (T5.3).
 *
 * task 최소 테스트 ②의 뒷면이다 — 라우트 테스트가 "성공하면 셋이 함께 바뀐다" 를 보고,
 * 여기서는 **"중간에 실패하면 셋 다 안 바뀐다"** 를 트랜잭션 경계에서 직접 확인한다.
 */
import { prisma, QuoteStatus, WorkOrderStatus, type Prisma } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test } from "vitest";
import {
  addQuote,
  addWorkOrder,
  addWorkOrderTarget,
  createMaster,
  createWorkOrderScene,
} from "./testing";
import {
  findMyQuote,
  listLandlordQuotes,
  listMasterQuotes,
  QuoteAcceptConflictError,
  runQuoteAcceptance,
} from "./quotes";

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
});

async function sceneWithTwoQuotes() {
  const scene = await createWorkOrderScene();
  const order = await addWorkOrder(scene);
  const cheap = await createMaster("01044444444", { companyName: "성수홈케어" });
  const pricey = await createMaster("01066666666", { companyName: "왕십리설비" });
  return {
    scene,
    order,
    cheap,
    pricey,
    cheapQuote: await addQuote(order.id, cheap.profile.id, { amount: 150_000 }),
    priceyQuote: await addQuote(order.id, pricey.profile.id, { amount: 220_000 }),
  };
}

/** 세 쓰기가 끝난 뒤 상태를 한 줄로 읽는다 */
async function snapshot(orderId: string) {
  const order = await prisma.workOrder.findUniqueOrThrow({ where: { id: orderId } });
  const quotes = await prisma.workOrderQuote.findMany({
    where: { workOrderId: orderId },
    orderBy: { amount: "asc" },
  });
  return { order: order.status, quotes: quotes.map((quote) => quote.status) };
}

// ── 수락 트랜잭션 ────────────────────────────────────────────────────────────

test("세 쓰기가 모두 반영된다 — 배정 · 수락 1 · 나머지 거절", async () => {
  const { order, cheapQuote } = await sceneWithTwoQuotes();

  const result = await prisma.$transaction((tx) =>
    runQuoteAcceptance(tx, { quoteId: cheapQuote.id, workOrderId: order.id }),
  );
  expect(result.rejectedCount).toBe(1);
  expect(await snapshot(order.id)).toEqual({
    order: WorkOrderStatus.ASSIGNED,
    quotes: [QuoteStatus.ACCEPTED, QuoteStatus.REJECTED],
  });
});

test("**중간에 실패하면 전부 롤백된다** — 세 쓰기 뒤에 던져도 아무 것도 남지 않는다", async () => {
  const { order, cheapQuote } = await sceneWithTwoQuotes();

  await expect(
    prisma.$transaction(async (tx) => {
      await runQuoteAcceptance(tx, { quoteId: cheapQuote.id, workOrderId: order.id });
      // 응답을 만들다 터진 상황 — 커밋 전이라 세 쓰기가 통째로 사라져야 한다
      throw new Error("boom");
    }),
  ).rejects.toThrow("boom");

  expect(await snapshot(order.id)).toEqual({
    order: WorkOrderStatus.REQUESTED,
    quotes: [QuoteStatus.PROPOSED, QuoteStatus.PROPOSED],
  });
});

test("**나머지 거절(③)에서 터지면 앞의 둘(①②)도 되돌아간다**", async () => {
  const { order, cheapQuote } = await sceneWithTwoQuotes();

  await expect(
    prisma.$transaction(async (tx) => {
      // 견적 UPDATE 두 번째 호출(= 나머지 거절)만 터지게 만든 트랜잭션 클라이언트
      let updateCalls = 0;
      const failing = {
        ...tx,
        workOrderQuote: {
          ...tx.workOrderQuote,
          updateMany: (args: Prisma.WorkOrderQuoteUpdateManyArgs) => {
            updateCalls += 1;
            if (updateCalls === 2) throw new Error("거절 UPDATE 실패");
            return tx.workOrderQuote.updateMany(args);
          },
        },
      } as unknown as Prisma.TransactionClient;
      return runQuoteAcceptance(failing, { quoteId: cheapQuote.id, workOrderId: order.id });
    }),
  ).rejects.toThrow("거절 UPDATE 실패");

  // 의뢰도 배정되지 않았고 수락된 견적도 없다
  expect(await snapshot(order.id)).toEqual({
    order: WorkOrderStatus.REQUESTED,
    quotes: [QuoteStatus.PROPOSED, QuoteStatus.PROPOSED],
  });
});

test("이미 배정된 의뢰면 첫 관문(①)에서 막힌다 — CONFLICT", async () => {
  const scene = await createWorkOrderScene();
  const order = await addWorkOrder(scene, { status: WorkOrderStatus.ASSIGNED });
  const master = await createMaster("01044444444");
  const quote = await addQuote(order.id, master.profile.id);

  await expect(
    prisma.$transaction((tx) =>
      runQuoteAcceptance(tx, { quoteId: quote.id, workOrderId: order.id }),
    ),
  ).rejects.toBeInstanceOf(QuoteAcceptConflictError);
  expect((await snapshot(order.id)).quotes).toEqual([QuoteStatus.PROPOSED]);
});

test("견적이 이 의뢰의 것이 아니면 ② 에서 막히고 ① 도 되돌아간다", async () => {
  const scene = await createWorkOrderScene();
  const order = await addWorkOrder(scene);
  const otherOrder = await addWorkOrder(scene);
  const master = await createMaster("01044444444");
  const strayQuote = await addQuote(otherOrder.id, master.profile.id);

  await expect(
    prisma.$transaction((tx) =>
      runQuoteAcceptance(tx, { quoteId: strayQuote.id, workOrderId: order.id }),
    ),
  ).rejects.toBeInstanceOf(QuoteAcceptConflictError);

  // ① 이 이미 의뢰를 배정으로 옮겼지만 ② 가 던지며 통째로 롤백됐다
  const after = await prisma.workOrder.findUniqueOrThrow({ where: { id: order.id } });
  expect(after.status).toBe(WorkOrderStatus.REQUESTED);
});

// ── 조회·DTO ────────────────────────────────────────────────────────────────

test("임대인 견적 목록은 수락된 것이 먼저, 그다음 금액이 싼 순", async () => {
  const { order, cheapQuote, priceyQuote } = await sceneWithTwoQuotes();
  await prisma.$transaction((tx) =>
    runQuoteAcceptance(tx, { quoteId: priceyQuote.id, workOrderId: order.id }),
  );

  const quotes = await listLandlordQuotes(order.id);
  expect(quotes.map((quote) => quote.id)).toEqual([priceyQuote.id, cheapQuote.id]);
  expect(quotes[0]?.status).toBe("ACCEPTED");
});

test("견적 카드에 업체명·거리·업종이 실린다", async () => {
  const scene = await createWorkOrderScene();
  const order = await addWorkOrder(scene);
  const master = await createMaster("01044444444", {
    companyName: "성수홈케어",
    distanceKm: 2,
  });
  await addQuote(order.id, master.profile.id, { amount: 180_000, message: "방문 점검 후 확정" });

  const [quote] = await listLandlordQuotes(order.id);
  expect(quote?.companyName).toBe("성수홈케어");
  expect(quote?.masterName).toBe("최마스");
  expect(quote?.message).toBe("방문 점검 후 확정");
  expect(quote?.categories).toEqual(["REPAIR"]);
  // 건물에서 북쪽으로 2km 떨어뜨린 마스터다(하버사인 오차 범위)
  expect(quote?.distanceKm).toBeGreaterThan(1.9);
  expect(quote?.distanceKm).toBeLessThan(2.1);
});

test("건물이 없는 의뢰의 견적은 거리가 null", async () => {
  const scene = await createWorkOrderScene();
  const order = await addWorkOrder(scene, { buildingId: null, unitId: null });
  const master = await createMaster("01044444444");
  await addQuote(order.id, master.profile.id);

  const [quote] = await listLandlordQuotes(order.id);
  expect(quote?.distanceKm).toBeNull();
});

test("**push/pull 판정은 `WorkOrderTarget` 유무 하나다**", async () => {
  const scene = await createWorkOrderScene();
  const order = await addWorkOrder(scene);
  const pushed = await createMaster("01044444444");
  const pulled = await createMaster("01066666666");
  await addWorkOrderTarget(order.id, pushed.profile.id, 2.554);
  await addQuote(order.id, pushed.profile.id, { amount: 200_000 });
  await addQuote(order.id, pulled.profile.id, { amount: 150_000 });

  const quotes = await listLandlordQuotes(order.id);
  const byMaster = Object.fromEntries(
    quotes.map((quote) => [quote.masterProfileId, quote.source]),
  );
  expect(byMaster[pushed.profile.id]).toBe("PUSH");
  expect(byMaster[pulled.profile.id]).toBe("PULL");
});

test("추천은 **그 마스터·그 의뢰 조합**일 때만 PUSH 다 (다른 의뢰의 추천은 상관없다)", async () => {
  const scene = await createWorkOrderScene();
  const quoted = await addWorkOrder(scene);
  const otherOrder = await addWorkOrder(scene);
  const master = await createMaster("01044444444");
  // 추천은 다른 의뢰로 받았고, 견적은 이 의뢰에 냈다
  await addWorkOrderTarget(otherOrder.id, master.profile.id, 2);
  await addQuote(quoted.id, master.profile.id);

  const [quote] = await listLandlordQuotes(quoted.id);
  expect(quote?.source).toBe("PULL");
});

test("마스터 견적 목록은 아직 결정 전(제안)이 먼저, 그다음 최근순", async () => {
  const { scene, order, cheap, cheapQuote } = await sceneWithTwoQuotes();
  // 같은 마스터가 다른 의뢰에도 견적을 냈고, 그쪽은 아직 결정 전이다
  const anotherOrder = await addWorkOrder(scene);
  await addQuote(anotherOrder.id, cheap.profile.id, { amount: 90_000 });
  await prisma.$transaction((tx) =>
    runQuoteAcceptance(tx, { quoteId: cheapQuote.id, workOrderId: order.id }),
  );

  const quotes = await listMasterQuotes(cheap.profile.id);
  expect(quotes).toHaveLength(2);
  expect(quotes[0]?.status).toBe("PROPOSED");
  expect(quotes[0]?.workOrder.id).toBe(anotherOrder.id);
  expect(quotes[1]?.status).toBe("ACCEPTED");
});

test("마스터 견적 목록에는 내 것만 보인다 + 의뢰 요약이 함께 온다", async () => {
  const { order, cheap, pricey } = await sceneWithTwoQuotes();

  const mine = await listMasterQuotes(cheap.profile.id);
  expect(mine).toHaveLength(1);
  expect(mine[0]?.workOrder.id).toBe(order.id);
  expect(mine[0]?.workOrder.landlordName).toBe("김임대");
  expect(mine[0]?.workOrder.place?.unitLabel).toBe("201호");
  expect(await listMasterQuotes(pricey.profile.id)).toHaveLength(1);
});

test("findMyQuote 는 의뢰당 내 견적 하나(없으면 null)", async () => {
  const { order, cheap, pricey, cheapQuote } = await sceneWithTwoQuotes();
  const stranger = await createMaster("01077777777");

  expect((await findMyQuote(cheap.profile.id, order.id))?.id).toBe(cheapQuote.id);
  expect((await findMyQuote(pricey.profile.id, order.id))?.id).not.toBe(cheapQuote.id);
  expect(await findMyQuote(stranger.profile.id, order.id)).toBeNull();
});
