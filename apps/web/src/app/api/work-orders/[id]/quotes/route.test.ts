/**
 * `POST /api/work-orders/[id]/quotes` 테스트 (T5.3) — 마스터의 견적 제안.
 *
 * task 최소 테스트 중 **①중복 견적 409** 와 **③ASSIGNED 후 신규 견적 거부** 가 여기 있다.
 */
import { MasterCategory, prisma, QuoteStatus, WorkOrderStatus } from "@zari/db";
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

const propose = (id: string, body: unknown) =>
  POST(
    new Request(`http://localhost/api/work-orders/${id}/quotes`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );

const QUOTE = { amount: 180_000, message: "순환펌프 교체 기준입니다." };

test("비로그인이면 401", async () => {
  expect((await propose("cmf0", QUOTE)).status).toBe(401);
});

test("마스터 프로필이 없으면 403 (임대인 계정)", async () => {
  const landlord = await createLandlord();
  await loginAs(landlord.user.id);
  expect((await propose("cmf0", QUOTE)).status).toBe(403);
});

test("없는 의뢰는 404", async () => {
  const master = await createMaster("01044444444");
  await loginAs(master.user.id);
  expect((await propose("cmf0notexist", QUOTE)).status).toBe(404);
});

test("업종이 다른 마스터는 제안할 수 없다 — 403", async () => {
  const scene = await createWorkOrderScene();
  const order = await addWorkOrder(scene, { category: MasterCategory.REPAIR });
  const master = await createMaster("01044444444", { categories: [MasterCategory.CLEANING] });

  await loginAs(master.user.id);
  const response = await propose(order.id, QUOTE);
  expect(response.status).toBe(403);
  expect(await prisma.workOrderQuote.count()).toBe(0);
});

test("활동반경 밖의 마스터는 제안할 수 없다 — 403", async () => {
  const scene = await createWorkOrderScene();
  const order = await addWorkOrder(scene);
  // 건물에서 12km 떨어져 있는데 활동반경은 5km
  const master = await createMaster("01044444444", { distanceKm: 12, radiusKm: 5 });

  await loginAs(master.user.id);
  expect((await propose(order.id, QUOTE)).status).toBe(403);
});

test("업종·반경이 맞으면 무료 마스터도 견적을 낸다 — 201 · PULL", async () => {
  const scene = await createWorkOrderScene();
  const order = await addWorkOrder(scene);
  const master = await createMaster("01044444444", { distanceKm: 2, radiusKm: 5 }); // FREE

  await loginAs(master.user.id);
  const response = await propose(order.id, QUOTE);
  expect(response.status).toBe(201);

  const body = await response.json();
  expect(body.quote.amount).toBe(180_000);
  expect(body.quote.status).toBe("PROPOSED");
  // 추천을 받지 않고 피드에서 찾아간 건이라 PULL
  expect(body.quote.source).toBe("PULL");
  expect(body.quote.workOrder.id).toBe(order.id);

  const saved = await prisma.workOrderQuote.findFirstOrThrow({ where: { workOrderId: order.id } });
  expect(saved.masterProfileId).toBe(master.profile.id);
  expect(saved.status).toBe(QuoteStatus.PROPOSED);
});

test("추천(push)으로 받은 의뢰에 낸 견적은 PUSH 로 표시된다", async () => {
  const scene = await createWorkOrderScene();
  const order = await addWorkOrder(scene);
  const master = await createMaster("01044444444");
  await addWorkOrderTarget(order.id, master.profile.id, 2.554);

  await loginAs(master.user.id);
  const body = await (await propose(order.id, QUOTE)).json();
  expect(body.quote.source).toBe("PUSH");
});

test("추천받은 의뢰는 반경 밖으로 옮겨 가도 견적을 낼 수 있다", async () => {
  const scene = await createWorkOrderScene();
  const order = await addWorkOrder(scene);
  // 반경 밖(12km)이지만 추천을 이미 받았다 — 발송된 추천은 계속 열려 있어야 한다(T5.2 규칙)
  const master = await createMaster("01044444444", { distanceKm: 12, radiusKm: 5 });
  await addWorkOrderTarget(order.id, master.profile.id, 12);

  await loginAs(master.user.id);
  expect((await propose(order.id, QUOTE)).status).toBe(201);
});

test("**의뢰당 1회** — 같은 마스터가 두 번 내면 409 (견적은 1건 그대로)", async () => {
  const scene = await createWorkOrderScene();
  const order = await addWorkOrder(scene);
  const master = await createMaster("01044444444");

  await loginAs(master.user.id);
  expect((await propose(order.id, QUOTE)).status).toBe(201);

  const again = await propose(order.id, { amount: 150_000 });
  expect(again.status).toBe(409);
  expect((await again.json()).error.code).toBe("CONFLICT");

  const quotes = await prisma.workOrderQuote.findMany({ where: { workOrderId: order.id } });
  expect(quotes).toHaveLength(1);
  expect(quotes[0]?.amount).toBe(180_000); // 두 번째 금액으로 덮이지 않는다
});

test("다른 마스터는 같은 의뢰에 각자 낼 수 있다 — 견적 2건", async () => {
  const scene = await createWorkOrderScene();
  const order = await addWorkOrder(scene);
  const first = await createMaster("01044444444", { companyName: "성수홈케어" });
  const second = await createMaster("01066666666", { companyName: "왕십리설비" });

  await loginAs(first.user.id);
  expect((await propose(order.id, { amount: 180_000 })).status).toBe(201);
  await loginAs(second.user.id);
  expect((await propose(order.id, { amount: 150_000 })).status).toBe(201);

  expect(await prisma.workOrderQuote.count({ where: { workOrderId: order.id } })).toBe(2);
});

test("**배정된 의뢰에는 새 견적을 낼 수 없다** — 409", async () => {
  const scene = await createWorkOrderScene();
  const order = await addWorkOrder(scene, { status: WorkOrderStatus.ASSIGNED });
  const master = await createMaster("01044444444");

  await loginAs(master.user.id);
  const response = await propose(order.id, QUOTE);
  expect(response.status).toBe(409);
  expect((await response.json()).error.message).toContain("배정");
  expect(await prisma.workOrderQuote.count()).toBe(0);
});

test("완료·취소된 의뢰에도 낼 수 없다 — 409", async () => {
  const scene = await createWorkOrderScene();
  const done = await addWorkOrder(scene, { status: WorkOrderStatus.DONE });
  const cancelled = await addWorkOrder(scene, { status: WorkOrderStatus.CANCELLED });
  const master = await createMaster("01044444444");

  await loginAs(master.user.id);
  expect((await propose(done.id, QUOTE)).status).toBe(409);
  expect((await propose(cancelled.id, QUOTE)).status).toBe(409);
});

test("금액이 1,000원 미만·소수·문자열이면 400", async () => {
  const scene = await createWorkOrderScene();
  const order = await addWorkOrder(scene);
  const master = await createMaster("01044444444");
  await loginAs(master.user.id);

  expect((await propose(order.id, { amount: 500 })).status).toBe(400);
  expect((await propose(order.id, { amount: 1500.5 })).status).toBe(400);
  expect((await propose(order.id, { amount: "180000" })).status).toBe(400);
  expect((await propose(order.id, {})).status).toBe(400);
  expect(await prisma.workOrderQuote.count()).toBe(0);
});

test("1억원을 넘는 금액·500자 넘는 메시지는 400", async () => {
  const scene = await createWorkOrderScene();
  const order = await addWorkOrder(scene);
  const master = await createMaster("01044444444");
  await loginAs(master.user.id);

  expect((await propose(order.id, { amount: 100_000_001 })).status).toBe(400);
  expect((await propose(order.id, { amount: 180_000, message: "가".repeat(501) })).status).toBe(400);
});

test("메시지는 생략할 수 있다 — 빈 문자열은 null 로 저장된다", async () => {
  const scene = await createWorkOrderScene();
  const order = await addWorkOrder(scene);
  const master = await createMaster("01044444444");
  await loginAs(master.user.id);

  const body = await (await propose(order.id, { amount: 180_000, message: "   " })).json();
  expect(body.quote.message).toBeNull();
});

test("남의 견적은 내 것으로 안 바뀐다 — 다른 마스터가 이미 낸 의뢰에도 내 몫으로 낼 수 있다", async () => {
  const scene = await createWorkOrderScene();
  const order = await addWorkOrder(scene);
  const other = await createMaster("01066666666");
  await addQuote(order.id, other.profile.id, { amount: 150_000 });

  const mine = await createMaster("01044444444");
  await loginAs(mine.user.id);
  const body = await (await propose(order.id, { amount: 180_000 })).json();
  expect(body.quote.amount).toBe(180_000);

  const quotes = await prisma.workOrderQuote.findMany({ where: { workOrderId: order.id } });
  expect(quotes).toHaveLength(2);
});
