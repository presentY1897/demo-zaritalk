/**
 * `POST /api/brokerage-targets/[id]/respond` 테스트 (T3.7).
 *
 * task 최소 테스트: **respond 상태 전이(`SENT → VIEWED → ACCEPTED | DECLINED` 만)** ·
 * **타 중개인 타겟 403**. 전이표 자체는 `features/brokerage/status.test.ts` 가 순수 함수로 검증하고,
 * 여기서는 그 판정이 라우트·DB 까지 그대로 이어지는지를 본다.
 *
 * 마지막 테스트가 이 묶음의 핵심 연결점이다 —
 * **수락하면 T3.1 이 열어 둔 매물 등록 권한이 코드 변경 없이 실제로 열린다**
 * (`POST /api/listings` 를 중개인 세션으로 그대로 부른다).
 */
import { BrokerageTargetStatus, MessageKind, prisma } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import {
  addBrokerageRequest,
  addBrokerageTarget,
  createBrokerageScene,
  createRealtorWithDetail,
  createRealtorWithoutDetail,
} from "@/features/brokerage/testing";
import { createTenantOnlyUser, loginAs } from "@/features/landlord/testing";
import { resetTestCookies } from "@/lib/auth/testing";
import { POST as createListing } from "@/app/api/listings/route";
import { POST } from "./route";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
});

function respond(targetId: string, status: unknown): Promise<Response> {
  return POST(
    new Request(`http://localhost/api/brokerage-targets/${targetId}/respond`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    }),
    { params: Promise.resolve({ id: targetId }) },
  );
}

/** 임대인 + 공실 101호 + 요청 + 그 요청이 간 중개인 1명 */
async function scene(targetStatus: BrokerageTargetStatus = BrokerageTargetStatus.SENT) {
  const landlord = await createBrokerageScene();
  const realtor = await createRealtorWithDetail("01033333333", { distanceKm: 1, radiusKm: 3 });
  const request = await addBrokerageRequest(landlord);
  const target = await addBrokerageTarget(request.id, realtor.profile.id, {
    status: targetStatus,
  });
  return { landlord, realtor, request, target };
}

test("비로그인이면 401", async () => {
  const { target } = await scene();
  const res = await respond(target.id, "VIEWED");
  expect(res.status).toBe(401);
  expect((await res.json()).error.code).toBe("UNAUTHORIZED");
});

test("중개인 프로필이 없으면 403", async () => {
  const { target } = await scene();
  const tenant = await createTenantOnlyUser();
  await loginAs(tenant.user.id);
  expect((await respond(target.id, "VIEWED")).status).toBe(403);
});

test("활동지역을 등록하지 않은 중개인도 403", async () => {
  const { target } = await scene();
  const bare = await createRealtorWithoutDetail();
  await loginAs(bare.user.id);
  expect((await respond(target.id, "VIEWED")).status).toBe(403);
});

test("없는 타겟이면 404", async () => {
  const { realtor } = await scene();
  await loginAs(realtor.user.id);
  const res = await respond("cmf0notexist", "VIEWED");
  expect(res.status).toBe(404);
  expect((await res.json()).error.code).toBe("NOT_FOUND");
});

test("다른 중개인에게 간 타겟이면 403", async () => {
  const { target } = await scene();
  const stranger = await createRealtorWithDetail("01077777777", {
    distanceKm: 1,
    radiusKm: 3,
    name: "남중개",
  });
  await loginAs(stranger.user.id);

  const res = await respond(target.id, "VIEWED");
  expect(res.status).toBe(403);
  expect((await res.json()).error.code).toBe("FORBIDDEN");
  // 남의 타겟 상태는 그대로다
  const row = await prisma.brokerageTarget.findUniqueOrThrow({ where: { id: target.id } });
  expect(row.status).toBe(BrokerageTargetStatus.SENT);
});

test("모르는 상태 값이면 400", async () => {
  const { realtor, target } = await scene();
  await loginAs(realtor.user.id);
  const res = await respond(target.id, "SENT");
  expect(res.status).toBe(400);
  expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
});

test("SENT → VIEWED 는 열람으로 기록되고 respondedAt 은 찍히지 않는다", async () => {
  const { realtor, target } = await scene();
  await loginAs(realtor.user.id);

  const res = await respond(target.id, "VIEWED");
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.target.status).toBe("VIEWED");
  expect(body.target.respondedAt).toBeNull();
  expect(body.matched).toBe(false);

  const row = await prisma.brokerageTarget.findUniqueOrThrow({ where: { id: target.id } });
  expect(row.status).toBe(BrokerageTargetStatus.VIEWED);
  expect(row.respondedAt).toBeNull();
});

test("열람하지 않고 수락하면 409", async () => {
  const { realtor, target } = await scene();
  await loginAs(realtor.user.id);

  const res = await respond(target.id, "ACCEPTED");
  expect(res.status).toBe(409);
  const body = await res.json();
  expect(body.error.code).toBe("CONFLICT");
  expect(body.error.message).toContain("열람");
});

test("열람하지 않고 거절해도 409", async () => {
  const { realtor, target } = await scene();
  await loginAs(realtor.user.id);

  const res = await respond(target.id, "DECLINED");
  expect(res.status).toBe(409);
  expect((await res.json()).error.message).toContain("열람");
});

test("열람 → 수락: respondedAt · 요청 MATCHED · 임대인 알림이 함께 생긴다", async () => {
  const { landlord, realtor, request, target } = await scene(BrokerageTargetStatus.VIEWED);
  await loginAs(realtor.user.id);

  const res = await respond(target.id, "ACCEPTED");
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.target.status).toBe("ACCEPTED");
  expect(body.target.respondedAt).not.toBeNull();
  expect(body.matched).toBe(true);
  // 수락하면 임대인 연락처가 열린다
  expect(body.target.landlord.phone).toBe(landlord.user.phone);

  const row = await prisma.brokerageRequest.findUniqueOrThrow({ where: { id: request.id } });
  expect(row.status).toBe("MATCHED");

  const log = await prisma.messageLog.findFirstOrThrow({
    where: { kind: MessageKind.BROKERAGE_REQUEST },
  });
  expect(log.toPhone).toBe(landlord.user.phone);
  expect(log.title).toContain("수락");
  expect(log.title).toContain("행당해피빌 101호");
});

test("수락은 복수 허용 — 두 번째 수락에도 요청은 MATCHED 하나뿐이다", async () => {
  const { landlord, request } = await scene(BrokerageTargetStatus.VIEWED);
  const second = await createRealtorWithDetail("01066666666", {
    distanceKm: 2,
    radiusKm: 3,
    name: "두중개",
  });
  const secondTarget = await addBrokerageTarget(request.id, second.profile.id, {
    status: BrokerageTargetStatus.VIEWED,
  });

  const first = await prisma.brokerageTarget.findFirstOrThrow({
    where: { requestId: request.id, id: { not: secondTarget.id } },
    include: { realtorProfile: { include: { user: true } } },
  });
  await loginAs(first.realtorProfile.user.id);
  expect((await (await respond(first.id, "ACCEPTED")).json()).matched).toBe(true);

  resetTestCookies();
  await loginAs(second.user.id);
  const body = await (await respond(secondTarget.id, "ACCEPTED")).json();
  // 이미 MATCHED 라 이번 수락은 요청 상태를 옮기지 않는다
  expect(body.matched).toBe(false);

  const row = await prisma.brokerageRequest.findUniqueOrThrow({ where: { id: request.id } });
  expect(row.status).toBe("MATCHED");
  expect(
    await prisma.brokerageTarget.count({
      where: { requestId: request.id, status: BrokerageTargetStatus.ACCEPTED },
    }),
  ).toBe(2);
  // 수락 알림은 수락한 수만큼 간다
  expect(
    await prisma.messageLog.count({
      where: { kind: MessageKind.BROKERAGE_REQUEST, toPhone: landlord.user.phone },
    }),
  ).toBe(2);
});

test("거절은 요청 상태를 옮기지 않는다 (OPEN 그대로)", async () => {
  const { landlord, realtor, request, target } = await scene(BrokerageTargetStatus.VIEWED);
  await loginAs(realtor.user.id);

  const body = await (await respond(target.id, "DECLINED")).json();
  expect(body.target.status).toBe("DECLINED");
  expect(body.target.respondedAt).not.toBeNull();
  expect(body.matched).toBe(false);
  // 거절해도 연락처는 열리지 않는다
  expect(body.target.landlord.phone).toBeNull();

  const row = await prisma.brokerageRequest.findUniqueOrThrow({ where: { id: request.id } });
  expect(row.status).toBe("OPEN");
  expect(
    await prisma.messageLog.count({ where: { toPhone: landlord.user.phone } }),
  ).toBe(0);
});

test("한 번 응답하면 되돌릴 수 없다 (ACCEPTED → DECLINED 409)", async () => {
  const { realtor, target } = await scene(BrokerageTargetStatus.ACCEPTED);
  await loginAs(realtor.user.id);

  const res = await respond(target.id, "DECLINED");
  expect(res.status).toBe(409);
  expect((await res.json()).error.message).toContain("이미");
});

test("응답한 요청을 다시 열어도 열람 표시는 멱등이다 (200, 상태 불변)", async () => {
  const { realtor, target } = await scene(BrokerageTargetStatus.ACCEPTED);
  await loginAs(realtor.user.id);

  const res = await respond(target.id, "VIEWED");
  expect(res.status).toBe(200);
  expect((await res.json()).target.status).toBe("ACCEPTED");

  const row = await prisma.brokerageTarget.findUniqueOrThrow({ where: { id: target.id } });
  expect(row.status).toBe(BrokerageTargetStatus.ACCEPTED);
});

test("수락하면 T3.1 매물 등록 권한이 코드 변경 없이 열린다", async () => {
  const { landlord, realtor, target } = await scene(BrokerageTargetStatus.VIEWED);
  await loginAs(realtor.user.id);

  const listingBody = {
    unitId: landlord.unit.id,
    dealType: "WOLSE" as const,
    deposit: 10_000_000,
    monthlyRent: 500_000,
  };
  const request = () =>
    new Request("http://localhost/api/listings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(listingBody),
    });

  // 수락 전에는 "수락한 중개인" 이 아니라 403
  expect((await createListing(request())).status).toBe(403);

  expect((await respond(target.id, "ACCEPTED")).status).toBe(200);

  const created = await createListing(request());
  expect(created.status).toBe(201);
  const listing = (await created.json()).listing;
  expect(listing.listedBy.role).toBe("REALTOR");
  expect(listing.listedBy.profileId).toBe(realtor.profile.id);
  expect(listing.status).toBe("OPEN");
});
