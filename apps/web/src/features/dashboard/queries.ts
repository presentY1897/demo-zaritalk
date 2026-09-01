/**
 * 임대인 홈 대시보드 조회 (T1.9) — **서버 전용**(`@zari/db` 를 쓴다).
 *
 * 하는 일은 "무엇을 읽을지" 뿐이다. 계산·집계는 한 줄도 없고 전부
 * `./summary.ts`(순수 함수) → `@/lib/rent`(원장 엔진, T1.4) 로 위임한다.
 *
 * 라우트 핸들러(`GET /api/landlord/summary`)와 서버 컴포넌트(`/landlord`)가 **같은 함수**를 쓴다 —
 * 그래야 첫 화면이 받는 초기 데이터와 API 응답 모양이 한 글자도 어긋나지 않고
 * Tanstack Query 의 `initialData` 로 그대로 얹을 수 있다(T1.1 과 같은 패턴).
 */
import { ComplaintStatus, prisma, QuoteStatus } from "@zari/db";
import { kstToday } from "@/lib/rent";
import { buildLandlordSummary } from "./summary";
import type { LandlordSummaryDto } from "./types";

/** 집계에 쓰는 청구 컬럼만 — 원장 엔진 `describeCharge` 의 입력과 같다 */
const chargeSelect = {
  id: true,
  year: true,
  month: true,
  dueDate: true,
  rentAmount: true,
  maintenanceAmount: true,
  carriedOverAmount: true,
  lateFeeAmount: true,
  totalDue: true,
  paidAmount: true,
} as const;

export type LandlordSummaryOptions = {
  /**
   * 기준 시각. 테스트에서 특정 날짜를 재현할 때 넘긴다(기본: 지금).
   * "오늘"·"이번 달" 판정은 여기서 만든 `kstToday(now)` 하나로 통일한다.
   */
  now?: Date;
};

/**
 * 대시보드 집계.
 *
 * 계약은 상태를 가리지 않고 전부 읽는다 — 끝난 계약(ENDED)에 남은 미납도 임대인에게는
 * 여전히 받을 돈이기 때문이다. 만기 임박·호실 상태는 진행 중 계약(ACTIVE·PENDING_TENANT)만
 * 대상으로 하며, 그 필터는 `summary.ts` 안에 있다.
 */
export async function getLandlordSummary(
  ownerProfileId: string,
  options: LandlordSummaryOptions = {},
): Promise<LandlordSummaryDto> {
  const asOf = kstToday(options.now);

  const [buildings, complaintCount, latestComplaint, quoteCount, latestQuote] = await Promise.all([
    prisma.building.findMany({
      where: { ownerProfileId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        units: {
          orderBy: { label: "asc" },
          select: {
            id: true,
            label: true,
            leases: {
              orderBy: { startDate: "desc" },
              select: {
                id: true,
                status: true,
                tenantName: true,
                monthlyRent: true,
                endDate: true,
                charges: { orderBy: { dueDate: "asc" }, select: chargeSelect },
              },
            },
          },
        },
      },
    }),
    // 미확인 민원·견적 — 모델이 이미 스키마에 있으므로 집계는 진짜로 한다.
    // 시드에 데이터가 없어 지금은 0 이고, T2.6·T5.3 데이터가 들어오면 그대로 채워진다.
    prisma.complaint.count({
      where: {
        status: ComplaintStatus.OPEN,
        lease: { unit: { building: { ownerProfileId } } },
      },
    }),
    prisma.complaint.findFirst({
      where: {
        status: ComplaintStatus.OPEN,
        lease: { unit: { building: { ownerProfileId } } },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    }),
    prisma.workOrderQuote.count({
      where: { status: QuoteStatus.PROPOSED, workOrder: { requesterProfileId: ownerProfileId } },
    }),
    prisma.workOrderQuote.findFirst({
      where: { status: QuoteStatus.PROPOSED, workOrder: { requesterProfileId: ownerProfileId } },
      orderBy: { createdAt: "desc" },
      select: { workOrderId: true },
    }),
  ]);

  return buildLandlordSummary({
    buildings,
    inbox: {
      complaintCount,
      quoteCount,
      latestComplaintId: latestComplaint?.id ?? null,
      latestQuoteWorkOrderId: latestQuote?.workOrderId ?? null,
    },
    asOf,
  });
}
