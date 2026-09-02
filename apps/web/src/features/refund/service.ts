/**
 * 환급 신청 쓰기 작업 (T2.4·T2.5) — 서버 전용.
 *
 * 라우트 핸들러는 "검증 → 이 함수 호출 → 응답" 만 한다. 상태 전이 판정은
 * `status.ts` 한 곳, 서류 제한은 `documents.ts` 한 곳에서만 온다.
 *
 * ## 액션마다 무엇을 기록하나
 *
 * | 기록 | 어디에 |
 * |---|---|
 * | 상태 | `RefundApplication.status` |
 * | 심사자 | `reviewedById`(**모든 심사 액션**에서 갱신 — 심사시작 포함) |
 * | 시각 | 결정은 `decidedAt`, 제출은 `submittedAt`, 그 밖은 `updatedAt` |
 * | 심사 코멘트 | `reviewNote` — 액션마다 덮어쓴다(= 마지막 심사 코멘트) |
 * | 세입자 통지 | `MessageLog` 한 줄(알림톡 시뮬) — 액션마다 남으므로 **시간순 이력**이 된다 |
 *
 * > **완전한 감사 로그를 남기려면 테이블이 하나 더 필요하다**(`RefundReviewLog`:
 * > 신청 id·이전/다음 상태·심사자·코멘트·시각). 지금 스키마는 Phase 5 가 마이그레이션 중이라
 * > 열 수 없어서, 위 컬럼 + `MessageLog` 로 대신했다. 스키마를 열 수 있게 되면 옮긴다.
 */
import { MessageKind, prisma, type Prisma } from "@zari/db";
import { formatDateOnly } from "@/features/lease/rules";
import type { RefundCalcInput } from "./calc";
import { calculateRefund } from "./calc";
import type { RefundDocumentMeta } from "./documents";
import type { RefundApplicationRow } from "./ownership";
import {
  buildDocumentsEnvelope,
  readDocuments,
  readStoredCalc,
  toApplicationColumns,
  type RefundStoredCalc,
} from "./queries";
import { REFUND_STATUS_META, type RefundStatusValue } from "./status";

/** 신청 저장 값 — 생성·수정이 같은 함수를 쓴다(부분 수정을 받지 않는 이유는 schema.ts 주석) */
export function buildApplicationWrite(
  input: RefundCalcInput & { leaseId?: string | null },
  asOf: Date,
  files: readonly RefundDocumentMeta[],
): {
  annualIncome: number;
  startYear: number;
  endYear: number;
  expectedAmount: number;
  leaseId: string | null;
  documents: Prisma.InputJsonValue;
} {
  const result = calculateRefund(input, asOf);
  const columns = toApplicationColumns(input, result);
  const calc: RefundStoredCalc = {
    monthlyRent: input.monthlyRent,
    startDate: input.startDate,
    endDate: input.endDate,
    asOf: formatDateOnly(asOf),
  };
  return {
    ...columns,
    leaseId: input.leaseId ?? null,
    documents: buildDocumentsEnvelope(files, calc) as unknown as Prisma.InputJsonValue,
  };
}

/** 서류 1건을 봉투에 얹는다 — 계산 입력은 그대로 둔다 */
export function appendDocument(
  row: RefundApplicationRow,
  document: RefundDocumentMeta,
): Prisma.InputJsonValue {
  const files = [...readDocuments(row.documents), document];
  return buildDocumentsEnvelope(files, readStoredCalc(row)) as unknown as Prisma.InputJsonValue;
}

/** 업로드 단계 — 보완요청을 받은 뒤에 올린 서류인지 표시한다 */
export function uploadStageFor(status: RefundStatusValue): RefundDocumentMeta["stage"] {
  return status === "NEED_MORE_DOCS" ? "SUPPLEMENT" : "INITIAL";
}

/**
 * 보완 재제출인데 **새로 올린 서류가 하나도 없는** 경우를 걸러낸다.
 *
 * 보완요청 시각(`decidedAt`) 이후에 올라온 서류가 1건도 없으면 심사자가 요구한 것을
 * 아무것도 안 낸 채 "다시 봐 달라" 는 것이라 되돌려보낸다.
 */
export function hasSupplementSince(
  documents: readonly RefundDocumentMeta[],
  since: Date | null,
): boolean {
  if (!since) return documents.length > 0;
  return documents.some((doc) => new Date(doc.uploadedAt).getTime() > since.getTime());
}

export type ReviewNotification = {
  id: string;
  title: string;
  toPhone: string;
  sentAt: string;
};

/**
 * 세입자 알림톡 시뮬(T2.5) — 실제 발송 대신 `MessageLog` 한 줄.
 *
 * `MessageKind` 에 환급 전용 값이 없어 `ETC` 를 쓴다(enum 추가는 스키마 변경이라 막혀 있다).
 * 본문에 **신청 id·상태·심사자·시각**을 적어 두어, 나중에 어떤 액션의 통지였는지 읽을 수 있게 한다.
 */
export async function notifyTenantOfReview(input: {
  application: RefundApplicationRow;
  status: RefundStatusValue;
  actorName: string;
  note: string | null;
  at: Date;
}): Promise<ReviewNotification> {
  const meta = REFUND_STATUS_META[input.status];
  const title = `[자리] 환급 신청이 「${meta.label}」 상태로 바뀌었습니다`;
  const lines = [
    `${input.application.tenantProfile.user.name}님의 월세 환급 신청(${input.application.id})이`,
    `「${meta.label}」 상태가 되었습니다.`,
    `처리자: ${input.actorName}`,
    `처리 시각: ${input.at.toISOString()}`,
    input.note ? `심사 코멘트: ${input.note}` : null,
    "자리 앱 > 환급 탭에서 확인해 주세요.",
  ].filter((line): line is string => line !== null);

  const log = await prisma.messageLog.create({
    data: {
      kind: MessageKind.ETC,
      toPhone: input.application.tenantProfile.user.phone,
      title,
      body: lines.join("\n"),
    },
  });
  return {
    id: log.id,
    title: log.title,
    toPhone: log.toPhone,
    sentAt: log.sentAt.toISOString(),
  };
}
