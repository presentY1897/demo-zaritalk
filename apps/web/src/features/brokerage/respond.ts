/**
 * 중개인 응답 처리 (T3.7) — **상태 전이를 실제로 적용하는 유일한 곳.**
 *
 * 규칙 자체(`SENT → VIEWED → ACCEPTED | DECLINED`)는 순수 모듈
 * [`./status.ts`](./status.ts) 의 전이표에 있고, 여기서는 그 판정을 그대로 받아
 * DB 에 적용하고 부수효과(요청 `MATCHED` 전이 · 임대인 알림)를 붙인다.
 *
 * ## 한 번의 수락이 하는 일 세 가지
 *
 * | | 무엇 | 왜 |
 * |---|---|---|
 * | ① | `BrokerageTarget.status = ACCEPTED` + `respondedAt` | 응답 기록 |
 * | ② | **첫 수락이면** `BrokerageRequest.status = OPEN → MATCHED` | 임대인 목록에 "매칭" 이 뜬다. 수락은 복수 허용이라 두 번째부터는 이미 MATCHED 다 |
 * | ③ | 임대인에게 알림톡 시뮬(`MessageLog`) | T1.7 과 같은 발송 로그 |
 *
 * 그리고 수락은 **매물 등록 권한**도 함께 연다 — 판정은 T3.1 이 이미 만들어 둔
 * `features/listing/permissions.ts` 의 `hasAcceptedBrokerage`(= `BrokerageTarget.status === ACCEPTED`)
 * 가 하므로 여기서 따로 할 일이 없다. **이 함수가 상태를 옮기는 순간 그 권한이 열린다.**
 *
 * 열람(`VIEWED`)은 멱등이라 아무 것도 바뀌지 않을 수 있다(`changed: false`).
 */
import { MessageKind, prisma, type Prisma } from "@zari/db";
import type { OwnedTarget } from "./ownership";
import {
  checkTargetTransition,
  formatBrokeragePlace,
  shouldMatchRequest,
  type BrokerageRespondTarget,
} from "./status";
import type { BrokerageRequestStatusValue, BrokerageTargetStatusValue } from "./types";

export type RespondOutcome =
  | { ok: true; changed: boolean; matched: boolean }
  /** 전이표가 막은 경우 — 호출부(라우트)는 409 `CONFLICT` 로 바꾼다 */
  | { ok: false; reason: string };

/**
 * 타겟 상태를 옮긴다. 소유 판정(403)은 `requireOwnedTarget` 이 이미 끝냈다.
 *
 * `respondedAt` 은 **수락·거절에만** 찍는다 — 열람은 응답이 아니다.
 */
export async function applyBrokerageResponse(
  target: NonNullable<OwnedTarget>,
  next: BrokerageRespondTarget,
  now: Date = new Date(),
): Promise<RespondOutcome> {
  const transition = checkTargetTransition(
    target.status as BrokerageTargetStatusValue,
    next,
  );
  if (!transition.ok) return { ok: false, reason: transition.reason };
  if (!transition.changed) return { ok: true, changed: false, matched: false };

  const isResponse = next !== "VIEWED";
  const matched = shouldMatchRequest(
    target.request.status as BrokerageRequestStatusValue,
    next,
  );

  const writes: Prisma.PrismaPromise<unknown>[] = [
    prisma.brokerageTarget.update({
      where: { id: target.id },
      data: { status: next, ...(isResponse ? { respondedAt: now } : {}) },
    }),
  ];

  if (matched) {
    // 첫 수락에서만 — 이미 MATCHED·CLOSED 인 요청은 건드리지 않는다
    writes.push(
      prisma.brokerageRequest.update({
        where: { id: target.requestId },
        data: { status: "MATCHED" },
      }),
    );
  }

  if (next === "ACCEPTED") {
    const place = formatBrokeragePlace({
      buildingName: target.request.unit.building.name,
      unitLabel: target.request.unit.label,
    });
    // 알림톡 시뮬레이터(T1.7 과 같은 발송 로그). 임대인 계정의 번호로 남긴다.
    // `MessageKind` 에 "중개 수락" 값이 없어 요청과 같은 `BROKERAGE_REQUEST` 로 남긴다
    // (스키마는 이번 task 소유가 아니다 — 문서의 "스키마를 건드리지 않고 앱에서 처리한 것" 참고).
    writes.push(
      prisma.messageLog.create({
        data: {
          kind: MessageKind.BROKERAGE_REQUEST,
          toPhone: target.request.landlordProfile.user.phone,
          title: `중개 요청 수락 — ${place}`,
          body: `중개인이 ${place} 중개를 수락했습니다. 연락처는 중개요청 화면에서 확인할 수 있습니다.`,
        },
      }),
    );
  }

  await prisma.$transaction(writes);
  return { ok: true, changed: true, matched };
}
