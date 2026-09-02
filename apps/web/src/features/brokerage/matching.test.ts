/**
 * 반경 매칭·발송 테스트 (T3.6) — task 최소 테스트 4종이 전부 여기 있다.
 *
 * ① **하버사인 거리** ② **반경 밖 제외** ③ **21명+ 시 거리순 20명 컷** ④ **대상 유니크**
 *
 * 거리 계산 자체(경계값·대칭성 등)는 T5.1 이 만든 순수 모듈 테스트
 * `src/lib/geo/distance.test.ts` 가 이미 검증한다 — 여기서는 그 함수를 실제로 **쓰고 있는지**,
 * 그리고 저장되는 값이 그 결과와 같은지를 본다.
 */
import { BrokerageTargetStatus, MessageKind, prisma } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test } from "vitest";
import { haversineKm, roundKm } from "@/lib/geo/distance";
import {
  BROKERAGE_TARGET_LIMIT,
  dispatchBrokerageTargets,
  selectBrokerageTargets,
} from "./matching";
import {
  addBrokerageRequest,
  BUILDING_POINT,
  createBrokerageScene,
  createRealtorWithDetail,
  officePointNorthOf,
} from "./testing";

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
});

test("① 저장되는 거리는 하버사인 거리다 (건물 → 사무소)", async () => {
  const scene = await createBrokerageScene();
  const realtor = await createRealtorWithDetail("01033333333", { distanceKm: 2, radiusKm: 5 });
  const request = await addBrokerageRequest(scene);

  expect(await dispatchBrokerageTargets(request.id)).toBe(1);

  const target = await prisma.brokerageTarget.findFirstOrThrow({
    where: { requestId: request.id },
  });
  const expected = roundKm(haversineKm(BUILDING_POINT, officePointNorthOf(2)));
  expect(target.distanceKm).toBe(expected);
  // 위도 1도 ≈ 111.19km 로 놓은 좌표라 2km 근처여야 한다
  expect(target.distanceKm).toBeGreaterThan(1.99);
  expect(target.distanceKm).toBeLessThan(2.01);
  expect(target.realtorProfileId).toBe(realtor.profile.id);
  expect(target.status).toBe(BrokerageTargetStatus.SENT);
});

test("② 활동반경 밖 중개인은 제외된다 (반경은 중개인이 정한 값)", async () => {
  const scene = await createBrokerageScene();
  const near = await createRealtorWithDetail("01033333333", { distanceKm: 2, radiusKm: 3 });
  // 같은 2km 인데 반경이 1km 라 자기 반경 밖 — 판정은 후보마다 다르다
  await createRealtorWithDetail("01044444444", { distanceKm: 2, radiusKm: 1 });
  // 아예 먼 중개인
  await createRealtorWithDetail("01055555555", { distanceKm: 30, radiusKm: 5 });

  const request = await addBrokerageRequest(scene);
  expect(await dispatchBrokerageTargets(request.id)).toBe(1);

  const targets = await prisma.brokerageTarget.findMany({ where: { requestId: request.id } });
  expect(targets).toHaveLength(1);
  expect(targets[0]?.realtorProfileId).toBe(near.profile.id);
});

test("② 반경 경계값은 포함한다 (거리 = 반경)", async () => {
  const scene = await createBrokerageScene();
  const exact = roundKm(haversineKm(BUILDING_POINT, officePointNorthOf(2)), 6);
  await createRealtorWithDetail("01033333333", { distanceKm: 2, radiusKm: exact });

  const request = await addBrokerageRequest(scene);
  expect(await dispatchBrokerageTargets(request.id)).toBe(1);
});

test("③ 반경 안 중개인이 21명이면 거리순 20명까지만 간다", async () => {
  const scene = await createBrokerageScene();
  // 1.0km, 1.1km … 3.0km — 전부 반경 5km 안이다(21명)
  for (let index = 0; index < 21; index += 1) {
    await createRealtorWithDetail(`0101000${String(index).padStart(4, "0")}`, {
      distanceKm: 1 + index * 0.1,
      radiusKm: 5,
      officeName: `사무소${index}`,
    });
  }

  const request = await addBrokerageRequest(scene);
  expect(await dispatchBrokerageTargets(request.id)).toBe(BROKERAGE_TARGET_LIMIT);

  const targets = await prisma.brokerageTarget.findMany({
    where: { requestId: request.id },
    include: { realtorProfile: { include: { realtorDetail: true } } },
    orderBy: { distanceKm: "asc" },
  });
  expect(targets).toHaveLength(20);
  // 가장 가까운 20명이 남고, 21번째(가장 먼 3.0km)는 빠진다
  expect(targets[0]?.realtorProfile.realtorDetail?.officeName).toBe("사무소0");
  expect(targets[19]?.realtorProfile.realtorDetail?.officeName).toBe("사무소19");
  const names = targets.map((target) => target.realtorProfile.realtorDetail?.officeName);
  expect(names).not.toContain("사무소20");
  // 거리순 정렬 자체도 확인한다
  const distances = targets.map((target) => target.distanceKm);
  expect([...distances].sort((a, b) => a - b)).toEqual(distances);
});

test("④ 같은 요청으로 다시 발송해도 대상은 유니크하다 (중복 타겟·중복 알림 없음)", async () => {
  const scene = await createBrokerageScene();
  await createRealtorWithDetail("01033333333", { distanceKm: 1, radiusKm: 3 });
  const request = await addBrokerageRequest(scene);

  expect(await dispatchBrokerageTargets(request.id)).toBe(1);
  // 두 번째 호출은 새로 보낼 사람이 없다
  expect(await dispatchBrokerageTargets(request.id)).toBe(0);

  expect(await prisma.brokerageTarget.count({ where: { requestId: request.id } })).toBe(1);
  expect(await prisma.messageLog.count({ where: { kind: MessageKind.BROKERAGE_REQUEST } })).toBe(1);
});

test("④ 재발송은 그 사이 새로 조건을 만족하게 된 중개인에게만 간다", async () => {
  const scene = await createBrokerageScene();
  await createRealtorWithDetail("01033333333", { distanceKm: 1, radiusKm: 3 });
  const request = await addBrokerageRequest(scene);
  expect(await dispatchBrokerageTargets(request.id)).toBe(1);

  await createRealtorWithDetail("01044444444", { distanceKm: 2, radiusKm: 3 });
  expect(await dispatchBrokerageTargets(request.id)).toBe(1);
  expect(await prisma.brokerageTarget.count({ where: { requestId: request.id } })).toBe(2);
});

test("미리보기와 실제 발송이 같은 대상을 고른다", async () => {
  const scene = await createBrokerageScene();
  await createRealtorWithDetail("01033333333", { distanceKm: 1, radiusKm: 3 });
  await createRealtorWithDetail("01044444444", { distanceKm: 2.5, radiusKm: 3 });
  await createRealtorWithDetail("01055555555", { distanceKm: 9, radiusKm: 3 }); // 반경 밖

  const preview = await selectBrokerageTargets(BUILDING_POINT);
  const request = await addBrokerageRequest(scene);
  const dispatched = await dispatchBrokerageTargets(request.id);

  expect(dispatched).toBe(preview.length);
  const targets = await prisma.brokerageTarget.findMany({
    where: { requestId: request.id },
    orderBy: { distanceKm: "asc" },
  });
  expect(targets.map((target) => target.realtorProfileId)).toEqual(
    preview.map((entry) => entry.candidate.profileId),
  );
  expect(targets.map((target) => target.distanceKm)).toEqual(
    preview.map((entry) => entry.distanceKm),
  );
});

test("미리보기는 아무 것도 쓰지 않는다", async () => {
  await createBrokerageScene();
  await createRealtorWithDetail("01033333333", { distanceKm: 1, radiusKm: 3 });

  await selectBrokerageTargets(BUILDING_POINT);
  expect(await prisma.brokerageTarget.count()).toBe(0);
  expect(await prisma.messageLog.count()).toBe(0);
});

test("발송하면 중개인 번호로 알림톡 시뮬 로그가 남는다 (T1.7 패턴)", async () => {
  const scene = await createBrokerageScene();
  await createRealtorWithDetail("01033333333", { distanceKm: 1, radiusKm: 3 });
  const request = await addBrokerageRequest(scene, { message: "즉시 입주 가능합니다." });
  await dispatchBrokerageTargets(request.id);

  const log = await prisma.messageLog.findFirstOrThrow({
    where: { kind: MessageKind.BROKERAGE_REQUEST },
  });
  expect(log.toPhone).toBe("01033333333");
  expect(log.title).toContain("행당해피빌 101호");
  expect(log.body).toContain("즉시 입주 가능합니다.");
});

test("반경 안에 중개인이 없으면 0명 — 요청 자체는 남는다", async () => {
  const scene = await createBrokerageScene();
  await createRealtorWithDetail("01033333333", { distanceKm: 40, radiusKm: 3 });
  const request = await addBrokerageRequest(scene);

  expect(await dispatchBrokerageTargets(request.id)).toBe(0);
  expect(await prisma.brokerageRequest.count()).toBe(1);
});

test("없는 요청 id 로 부르면 0명 (터지지 않는다)", async () => {
  expect(await dispatchBrokerageTargets("cmf0notexist")).toBe(0);
});
