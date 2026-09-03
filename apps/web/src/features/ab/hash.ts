/**
 * A/B 변형 배정의 **결정성**을 만드는 순수 함수 (T6.1).
 *
 * ## 왜 난수가 아니라 해시인가
 *
 * 배정을 난수로 뽑아 DB에 저장하면 "같은 사람은 같은 변형" 이 **DB 한 줄에만** 의존한다.
 * 그 줄이 없어지거나(테스트 DB 초기화·데이터 정리) 쓰기가 실패하면 사람이 변형 사이를 오간다.
 * 해시로 정하면 **anonId 만 있으면 언제 어디서 계산해도 같은 값**이 나오고, `AbAssignment` 는
 * "언제 처음 노출됐는가 · 어느 계정과 이어졌는가" 를 남기는 기록일 뿐 진실의 원천이 아니다.
 *
 * ## 씨앗에 실험 키를 섞는 이유
 *
 * 씨앗은 `"<experimentKey>:<anonId>"` 다. anonId 만 해싱하면 실험이 둘 이상일 때
 * **한 사람이 모든 실험에서 같은 쪽(전부 A 또는 전부 B)에 몰린다** — 실험끼리 교란된다.
 * 키를 섞으면 실험별로 독립적인 배정이 나온다(실측: 두 실험이 같은 변형일 확률 49.5%).
 *
 * ## 해시
 *
 * FNV-1a 32비트 + 최종 avalanche 믹스(xorshift-multiply). 새 의존성 0, 순수 산술이라
 * Node 버전·플랫폼에 상관없이 같은 값이 나온다. 32자 hex anonId 10만 개로 잰 A 비율은 49.9%.
 * (암호학적 용도가 아니다 — anonId 는 인증 수단이 아니라 "이 브라우저" 라벨이다.)
 */

/** 버킷 해상도 — 가중치를 0.01% 단위까지 표현할 수 있다. */
export const BUCKET_COUNT = 10_000;

/** FNV-1a 32비트 + avalanche. 같은 문자열이면 언제나 같은 부호 없는 32비트 정수. */
export function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  // FNV-1a 는 하위 비트가 뭉치는 경향이 있어 마지막에 비트를 흩는다.
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/** anonId × 실험 키 → 0 이상 `BUCKET_COUNT` 미만의 버킷. */
export function bucketOf(anonId: string, experimentKey: string): number {
  return hashSeed(`${experimentKey}:${anonId}`) % BUCKET_COUNT;
}

export type WeightedVariant = { key: string; weight: number };

/**
 * 버킷을 가중치 구간에 떨어뜨려 변형을 고른다.
 *
 * 가중치 합이 얼마든(50/50 이든 30/70 이든) 비율대로 나뉘고, 마지막 변형이 나머지를 받는다 —
 * 반올림 때문에 어떤 버킷도 변형 없이 남지 않게.
 */
export function pickVariant(bucket: number, variants: readonly WeightedVariant[]): string {
  const last = variants.at(-1);
  if (!last) throw new Error("변형이 없는 실험은 배정할 수 없습니다.");

  const total = variants.reduce((sum, variant) => sum + variant.weight, 0);
  if (total <= 0) return variants[0]?.key ?? last.key;

  let edge = 0;
  for (const [index, variant] of variants.entries()) {
    if (index === variants.length - 1) break; // 마지막은 나머지 전부를 받는다
    edge += Math.round((variant.weight / total) * BUCKET_COUNT);
    if (bucket < edge) return variant.key;
  }
  return last.key;
}

/** anonId 하나를 실험의 변형 하나로 — **이 함수가 배정의 진실이다.** */
export function variantFor(
  anonId: string,
  experimentKey: string,
  variants: readonly WeightedVariant[],
): string {
  return pickVariant(bucketOf(anonId, experimentKey), variants);
}
