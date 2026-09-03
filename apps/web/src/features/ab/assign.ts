/**
 * 변형 배정 (T6.1) — **DB 를 만지는 유일한 자리**.
 *
 * 배정 값 자체는 `hash.ts` 가 정한다(anonId × 실험 키 해시). 이 모듈이 하는 일은
 * `AbAssignment` 한 줄을 남겨 **언제 처음 노출됐고 어느 계정과 이어졌는지**를 기록하는 것이다.
 *
 * ```ts
 * const assignment = await assignVariant(anonId, NOTICE_CTA_EXPERIMENT, userId);
 * assignment.variant   // "A" | "B"
 * ```
 *
 * ## 저장이 실패해도 배정은 흔들리지 않는다
 *
 * 해시가 진실이므로 DB 쓰기가 실패해도 같은 사람은 같은 변형을 본다.
 * 공개 고지서는 미가입 세입자가 보는 화면이라 **기록 실패로 화면이 죽으면 안 된다** —
 * `assignVariant` 는 쓰기 오류를 삼키고 계산된 변형을 그대로 돌려준다(`persisted: false`).
 *
 * ## 동시 요청
 *
 * 같은 브라우저에서 두 요청이 동시에 들어오면 `create` 하나가 유니크 제약
 * (`@@unique([anonId, experimentKey])`)에 걸린다. 그때는 다시 읽어 이미 만들어진 줄을 쓴다 —
 * 어느 쪽이 이겨도 값은 해시로 같으므로 결과가 달라지지 않는다.
 *
 * ## userId 연결
 *
 * 고지서를 볼 때는 비로그인이고, 가입 뒤에야 계정이 생긴다. 그래서 **비어 있을 때만 채운다** —
 * 한 번 붙은 계정은 덮어쓰지 않는다(공용 브라우저에서 나중 사람이 앞사람의 배정을 가로채지 않게).
 */
import { prisma, type AbAssignment } from "@zari/db";
import { findExperiment, type ExperimentSpec } from "./experiments";
import { variantFor } from "./hash";

export type VariantAssignment = {
  experimentKey: string;
  anonId: string;
  variant: string;
  userId: string | null;
  assignedAt: Date;
  /** 이번 호출에서 처음 만들어진 배정인가 */
  created: boolean;
  /** DB 에 남았는가 — false 면 해시로 계산만 한 값이다(쓰기 실패) */
  persisted: boolean;
};

function toAssignment(row: AbAssignment, created: boolean): VariantAssignment {
  return {
    experimentKey: row.experimentKey,
    anonId: row.anonId,
    variant: row.variant,
    userId: row.userId,
    assignedAt: row.assignedAt,
    created,
    persisted: true,
  };
}

/** 기록된 변형이 아직 이 실험의 변형인가 — 실험 정의가 바뀌어 사라진 값이면 다시 배정한다. */
function isKnownVariant(spec: ExperimentSpec, variant: string): boolean {
  return spec.variants.some((item) => item.key === variant);
}

/**
 * 배정 조회/생성. 실험 키가 등록돼 있지 않으면 `null`(호출부가 404 로 만든다).
 *
 * 이미 배정이 있으면 **그 값을 그대로 쓴다** — 해시와 같은 값이지만, 실험 도중 가중치를 바꿔도
 * 이미 노출된 사람의 화면이 바뀌지 않게 하려는 것이다(중간에 변형이 바뀌면 그 사람의 전환은
 * 어느 변형의 성과인지 말할 수 없게 된다).
 */
export async function assignVariant(
  anonId: string,
  experimentKey: string,
  userId?: string | null,
): Promise<VariantAssignment | null> {
  const spec = findExperiment(experimentKey);
  if (!spec) return null;

  const variant = variantFor(anonId, spec.key, spec.variants);

  try {
    const existing = await prisma.abAssignment.findUnique({
      where: { anonId_experimentKey: { anonId, experimentKey: spec.key } },
    });

    if (existing) {
      const repaired = isKnownVariant(spec, existing.variant)
        ? existing
        : await prisma.abAssignment.update({
            where: { id: existing.id },
            data: { variant },
          });
      const linked = await linkUser(repaired, userId);
      return toAssignment(linked, false);
    }

    const created = await prisma.abAssignment.create({
      data: { anonId, experimentKey: spec.key, variant, userId: userId ?? null },
    });
    return toAssignment(created, true);
  } catch {
    // 동시 생성으로 유니크 제약에 걸렸으면 이미 만들어진 줄이 있다.
    const raced = await prisma.abAssignment
      .findUnique({ where: { anonId_experimentKey: { anonId, experimentKey: spec.key } } })
      .catch(() => null);
    if (raced) return toAssignment(raced, false);

    // DB 자체가 말을 듣지 않아도 배정은 해시로 정해져 있다 — 화면은 그대로 그린다.
    return {
      experimentKey: spec.key,
      anonId,
      variant,
      userId: userId ?? null,
      assignedAt: new Date(),
      created: false,
      persisted: false,
    };
  }
}

/** 비어 있을 때만 계정을 붙인다(덮어쓰지 않는다). */
async function linkUser(row: AbAssignment, userId?: string | null): Promise<AbAssignment> {
  if (!userId || row.userId) return row;
  const result = await prisma.abAssignment.updateMany({
    where: { id: row.id, userId: null },
    data: { userId },
  });
  return result.count > 0 ? { ...row, userId } : row;
}
