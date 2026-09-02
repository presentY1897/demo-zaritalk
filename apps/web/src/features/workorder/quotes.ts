/**
 * 견적 조회·DTO 매핑 + **수락 트랜잭션** (T5.3) — 서버 전용(`@zari/db` 를 쓴다).
 *
 * 라우트 핸들러와 서버 컴포넌트가 **같은 함수**를 쓴다(T1.1 이 세운 규칙).
 *
 * ## 이 파일의 핵심은 `runQuoteAcceptance` 하나다
 *
 * 수락은 세 가지 쓰기가 **한 덩어리**여야 한다.
 *
 * | # | 쓰기 | 실패하면 |
 * |---|---|---|
 * | ① | 의뢰 `REQUESTED → ASSIGNED` (전이 전 상태를 조건에 넣은 `updateMany`) | 전부 롤백 · 409 |
 * | ② | 이 견적 `PROPOSED → ACCEPTED` | 전부 롤백 · 409 |
 * | ③ | 같은 의뢰의 **나머지 견적 전부** `PROPOSED → REJECTED` | 전부 롤백 · 500 |
 *
 * **동시 요청은 ① 이 막는다.** 서로 다른 견적 2건을 동시에 수락해도 두 트랜잭션이 같은
 * `WorkOrder` 행을 두고 다툰다 — PostgreSQL 이 행 잠금을 걸고, 뒤에 온 쪽은 잠금이 풀린 뒤
 * 조건(`status = 'REQUESTED'`)을 다시 평가해 `count = 0` 을 받는다. 그래서 **정확히 하나만**
 * 성공한다. 견적 쪽(②)만 조건부로 걸면 서로 다른 견적끼리는 다투지 않아 둘 다 통과해 버린다.
 *
 * `runQuoteAcceptance` 는 트랜잭션 클라이언트를 인자로 받는다 — 호출부(`acceptQuote`)가
 * 경계를 잡고, 테스트는 같은 함수를 자기 트랜잭션 안에서 굴려 **중간 실패 시 롤백**을 검증한다.
 */
import { prisma, type Prisma } from "@zari/db";
import { haversineKm, roundKm } from "@/lib/geo/distance";
import { formatDateKey } from "@/lib/rent";
import { getLandlordWorkOrder, toWorkOrderPlace } from "./queries";
import type {
  LandlordQuoteDto,
  LandlordWorkOrderDetail,
  MasterCategoryValue,
  MasterQuoteDto,
  QuoteSource,
  QuoteStatusValue,
  WorkOrderStatusValue,
} from "./types";

/** 견적 카드가 필요로 하는 관계 — 업체명·업종·좌표(거리)와 의뢰 위치 */
const quoteInclude = {
  masterProfile: {
    include: {
      masterDetail: true,
      user: { select: { name: true } },
    },
  },
  workOrder: {
    include: {
      building: true,
      unit: true,
      requesterProfile: { include: { user: { select: { name: true } } } },
    },
  },
} satisfies Prisma.WorkOrderQuoteInclude;

type QuoteRow = Prisma.WorkOrderQuoteGetPayload<{ include: typeof quoteInclude }>;

/**
 * 의뢰 건물 ↔ 마스터 사무소 거리(km). 둘 중 하나라도 좌표가 없으면 null.
 * 계산식은 `@/lib/geo/distance` 한 곳뿐이다(T5.1 이 세운 단일 출처).
 */
function quoteDistanceKm(row: QuoteRow): number | null {
  const building = row.workOrder.building;
  const detail = row.masterProfile.masterDetail;
  if (!building || !detail) return null;
  return roundKm(haversineKm(detail, building));
}

/**
 * 이 견적이 **추천(push)받은 의뢰**에 낸 것인지 판정한다.
 *
 * 스키마에 컬럼을 새로 만들지 않고 `WorkOrderTarget` 행의 유무로 본다 — T5.2 의 `recommended`
 * 와 **같은 판정**이라 마스터 홈의 「추천」 배지와 견적 목록의 「추천」 배지가 어긋날 수 없다.
 */
async function loadQuoteSources(
  pairs: readonly { workOrderId: string; masterProfileId: string }[],
): Promise<Set<string>> {
  if (pairs.length === 0) return new Set();
  const targets = await prisma.workOrderTarget.findMany({
    where: {
      OR: pairs.map((pair) => ({
        workOrderId: pair.workOrderId,
        masterProfileId: pair.masterProfileId,
      })),
    },
    select: { workOrderId: true, masterProfileId: true },
  });
  return new Set(targets.map((target) => `${target.workOrderId}:${target.masterProfileId}`));
}

function sourceOf(row: QuoteRow, pushed: Set<string>): QuoteSource {
  return pushed.has(`${row.workOrderId}:${row.masterProfileId}`) ? "PUSH" : "PULL";
}

function toLandlordQuote(row: QuoteRow, pushed: Set<string>): LandlordQuoteDto {
  const detail = row.masterProfile.masterDetail;
  return {
    id: row.id,
    workOrderId: row.workOrderId,
    amount: row.amount,
    message: row.message,
    status: row.status as QuoteStatusValue,
    createdAt: row.createdAt.toISOString(),
    masterProfileId: row.masterProfileId,
    // 업체 프로필이 지워진 계정도 카드가 깨지지 않게 사람 이름으로 대신 채운다
    companyName: detail?.companyName ?? row.masterProfile.user.name,
    masterName: row.masterProfile.user.name,
    categories: (detail?.categories ?? []) as MasterCategoryValue[],
    distanceKm: quoteDistanceKm(row),
    source: sourceOf(row, pushed),
  };
}

function toMasterQuote(row: QuoteRow, pushed: Set<string>): MasterQuoteDto {
  const order = row.workOrder;
  return {
    id: row.id,
    amount: row.amount,
    message: row.message,
    status: row.status as QuoteStatusValue,
    createdAt: row.createdAt.toISOString(),
    source: sourceOf(row, pushed),
    workOrder: {
      id: order.id,
      category: order.category as MasterCategoryValue,
      description: order.description,
      desiredDate: order.desiredDate ? formatDateKey(order.desiredDate) : null,
      status: order.status as WorkOrderStatusValue,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      place: toWorkOrderPlace(order),
      landlordName: order.requesterProfile.user.name,
      distanceKm: quoteDistanceKm(row),
    },
  };
}

/**
 * 한 의뢰가 받은 견적 — **수락된 것이 먼저**, 그다음 금액이 싼 순.
 * **권한은 보지 않는다**(호출부가 `requireOwnWorkOrder` 를 먼저 통과시킨다).
 */
export async function listLandlordQuotes(workOrderId: string): Promise<LandlordQuoteDto[]> {
  const rows = await prisma.workOrderQuote.findMany({
    where: { workOrderId },
    include: quoteInclude,
    orderBy: [{ amount: "asc" }, { createdAt: "asc" }],
  });
  const pushed = await loadQuoteSources(rows);
  return rows
    .map((row) => toLandlordQuote(row, pushed))
    .sort((a, b) => {
      const acceptedDiff =
        Number(b.status === "ACCEPTED") - Number(a.status === "ACCEPTED");
      return acceptedDiff !== 0 ? acceptedDiff : a.amount - b.amount;
    });
}

/** 임대인 상세가 한 번에 읽는 것 — 의뢰 + 받은 견적 */
export async function getLandlordWorkOrderDetail(
  workOrderId: string,
): Promise<LandlordWorkOrderDetail | null> {
  const [workOrder, quotes] = await Promise.all([
    getLandlordWorkOrder(workOrderId),
    listLandlordQuotes(workOrderId),
  ]);
  return workOrder ? { workOrder, quotes } : null;
}

/** 내가 낸 견적 — **아직 결정 전(제안)이 먼저**, 그다음 최근 제안순 */
export async function listMasterQuotes(masterProfileId: string): Promise<MasterQuoteDto[]> {
  const rows = await prisma.workOrderQuote.findMany({
    where: { masterProfileId },
    include: quoteInclude,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  const pushed = await loadQuoteSources(rows);
  return rows
    .map((row) => toMasterQuote(row, pushed))
    .sort((a, b) => {
      const pendingDiff = Number(b.status === "PROPOSED") - Number(a.status === "PROPOSED");
      return pendingDiff !== 0 ? pendingDiff : b.createdAt.localeCompare(a.createdAt);
    });
}

/**
 * 내가 이 의뢰에 이미 낸 견적(없으면 null) — 마스터 상세가 「견적 보내기」 자리를 무엇으로
 * 그릴지 고르는 데 쓴다. 의뢰당 1회라 `@@unique` 로 최대 한 건이다.
 */
export async function findMyQuote(
  masterProfileId: string,
  workOrderId: string,
): Promise<MasterQuoteDto | null> {
  const row = await prisma.workOrderQuote.findUnique({
    where: { workOrderId_masterProfileId: { workOrderId, masterProfileId } },
    include: quoteInclude,
  });
  if (!row) return null;
  const pushed = await loadQuoteSources([row]);
  return toMasterQuote(row, pushed);
}

/** 견적 1건을 마스터 시점 DTO 로 — 제안 직후 응답에 그대로 싣는다 */
export async function getMasterQuote(quoteId: string): Promise<MasterQuoteDto | null> {
  const row = await prisma.workOrderQuote.findUnique({ where: { id: quoteId }, include: quoteInclude });
  if (!row) return null;
  const pushed = await loadQuoteSources([row]);
  return toMasterQuote(row, pushed);
}

/**
 * 수락 트랜잭션이 규칙에 막혔을 때 던지는 신호 — 호출부가 409 로 바꾼다.
 * 던지는 순간 **트랜잭션 전체가 롤백**된다(그래서 부분 반영이 남지 않는다).
 */
export class QuoteAcceptConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuoteAcceptConflictError";
  }
}

export type QuoteAcceptance = {
  /** 이번 수락으로 자동 거절된 다른 견적 수 */
  rejectedCount: number;
};

/**
 * **수락의 세 쓰기를 한 덩어리로 실행한다.** 트랜잭션 클라이언트를 받으므로 경계는 호출부가 잡는다.
 *
 * 순서가 곧 동시성 규칙이다 — 의뢰(①)를 먼저 잠가야 서로 다른 견적을 동시에 수락하려는
 * 두 요청이 같은 행을 두고 다툰다. 견적(②)부터 잠그면 둘이 다른 행이라 둘 다 통과한다.
 */
export async function runQuoteAcceptance(
  tx: Prisma.TransactionClient,
  input: { quoteId: string; workOrderId: string },
): Promise<QuoteAcceptance> {
  // ① 의뢰를 배정으로 — 전이 전 상태를 조건에 넣은 단일 UPDATE 가 동시 요청의 관문이다
  const assigned = await tx.workOrder.updateMany({
    where: { id: input.workOrderId, status: "REQUESTED" },
    data: { status: "ASSIGNED" },
  });
  if (assigned.count === 0) {
    throw new QuoteAcceptConflictError("이미 다른 견적이 수락됐거나 종결된 의뢰입니다.");
  }

  // ② 이 견적을 수락으로 — 제안 상태였을 때만
  const accepted = await tx.workOrderQuote.updateMany({
    where: { id: input.quoteId, workOrderId: input.workOrderId, status: "PROPOSED" },
    data: { status: "ACCEPTED" },
  });
  if (accepted.count !== 1) {
    throw new QuoteAcceptConflictError("이미 처리된 견적입니다.");
  }

  // ③ 나머지 전부 거절 — "하나를 고르면 나머지는 자동으로 닫힌다"
  const rejected = await tx.workOrderQuote.updateMany({
    where: { workOrderId: input.workOrderId, id: { not: input.quoteId }, status: "PROPOSED" },
    data: { status: "REJECTED" },
  });

  return { rejectedCount: rejected.count };
}

/** 수락 — 트랜잭션 경계를 잡고 `runQuoteAcceptance` 를 굴린다 */
export function acceptQuote(input: {
  quoteId: string;
  workOrderId: string;
}): Promise<QuoteAcceptance> {
  return prisma.$transaction((tx) => runQuoteAcceptance(tx, input));
}
