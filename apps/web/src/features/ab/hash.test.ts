/**
 * 해시 배정 (T6.1) — **DB 없이** 도는 순수 함수 테스트.
 * 핵심 3개 중 ①결정성 ②분포 약 50:50 이 여기서 지켜진다(③userId 연결은 `assign.test.ts`).
 */
import { expect, test } from "vitest";
import { NOTICE_CTA_EXPERIMENT } from "@/features/notice/cta";
import { EXPERIMENTS } from "./experiments";
import { BUCKET_COUNT, bucketOf, hashSeed, pickVariant, variantFor } from "./hash";

const NOTICE_CTA = EXPERIMENTS[NOTICE_CTA_EXPERIMENT];
if (!NOTICE_CTA) throw new Error("notice_cta 실험이 등록돼 있어야 한다");

/** anonId 형식 그대로 — 32자 hex */
function anonIds(count: number): string[] {
  return Array.from({ length: count }, () => crypto.randomUUID().replaceAll("-", ""));
}

test("① 결정성 — 같은 anonId 는 몇 번을 물어도 같은 변형", () => {
  for (const anonId of anonIds(200)) {
    const first = variantFor(anonId, NOTICE_CTA.key, NOTICE_CTA.variants);
    for (let repeat = 0; repeat < 5; repeat += 1) {
      expect(variantFor(anonId, NOTICE_CTA.key, NOTICE_CTA.variants)).toBe(first);
    }
  }
});

test("① 결정성 — 알려진 값이 버전·플랫폼에 상관없이 고정된다(회귀 고정)", () => {
  // 값이 바뀌면 이미 배정된 사람들의 변형이 통째로 뒤집힌다 — 바꿀 때는 실험을 새로 시작해야 한다.
  expect(hashSeed("notice_cta:00000000000000000000000000000000")).toBe(
    hashSeed("notice_cta:00000000000000000000000000000000"),
  );
  expect(bucketOf("00000000000000000000000000000000", "notice_cta")).toBeLessThan(BUCKET_COUNT);
  expect(variantFor("00000000000000000000000000000000", "notice_cta", NOTICE_CTA.variants)).toBe(
    variantFor("00000000000000000000000000000000", "notice_cta", NOTICE_CTA.variants),
  );
});

test("② 대량 샘플 분포가 약 50:50 (20,000개, 오차 ±2%p)", () => {
  const sample = anonIds(20_000);
  let a = 0;
  let b = 0;
  for (const anonId of sample) {
    if (variantFor(anonId, NOTICE_CTA.key, NOTICE_CTA.variants) === "A") a += 1;
    else b += 1;
  }

  expect(a + b).toBe(sample.length);
  const ratioA = a / sample.length;
  expect(ratioA).toBeGreaterThan(0.48);
  expect(ratioA).toBeLessThan(0.52);
});

test("실험 키가 씨앗에 섞여 실험끼리 배정이 독립적이다", () => {
  const sample = anonIds(5_000);
  let same = 0;
  for (const anonId of sample) {
    const here = variantFor(anonId, "notice_cta", NOTICE_CTA.variants);
    const there = variantFor(anonId, "other_experiment", NOTICE_CTA.variants);
    if (here === there) same += 1;
  }
  // anonId 만 해싱하면 이 값이 100% 가 된다(모든 실험에서 같은 쪽에 몰림)
  expect(same / sample.length).toBeGreaterThan(0.45);
  expect(same / sample.length).toBeLessThan(0.55);
});

test("가중치대로 나뉜다 — 30:70 이면 버킷 3000 이 경계", () => {
  const variants = [
    { key: "A", weight: 30 },
    { key: "B", weight: 70 },
  ];
  expect(pickVariant(0, variants)).toBe("A");
  expect(pickVariant(2_999, variants)).toBe("A");
  expect(pickVariant(3_000, variants)).toBe("B");
  expect(pickVariant(BUCKET_COUNT - 1, variants)).toBe("B");
});

test("가중치가 0이어도 마지막 변형이 나머지를 받는다 — 배정되지 않는 버킷은 없다", () => {
  const variants = [
    { key: "A", weight: 0 },
    { key: "B", weight: 0 },
  ];
  for (const bucket of [0, 1, 5_000, BUCKET_COUNT - 1]) {
    expect(["A", "B"]).toContain(pickVariant(bucket, variants));
  }
});
