/**
 * 임대장부 집계 (T1.6) — **DB를 모르는 순수 함수.** 단위 테스트가 DB 없이 돈다.
 *
 * 장부는 별도 입력이 없다. 원장(`RentCharge` + `RentPayment`)에서 **파생**한다.
 * 그래서 계산식을 여기서 새로 만들지 않고 원장 엔진(T1.4, `@/lib/rent`)이 export 한
 * `allocatePayments` 를 그대로 쓴다 — 납부액을 월세·관리비·연체료·이월로 나누는 건
 * 엔진의 **충당 순서(이월 → 연체료 → 관리비 → 월세)** 가 정하는 일이고,
 * 여기서 자체 배분 규칙을 만들면 T1.5 수납 화면과 장부 숫자가 어긋난다.
 *
 * ## ① 집계 기준은 `paidAt` (현금주의)
 *
 * "몇 월 수입인가" 는 **청구 월이 아니라 실제 납부 시점**(`RentPayment.paidAt`)으로 정한다.
 * 시드의 7월 청구는 7/10 에 부분납됐고, 이 40만원은 **7월 수입**으로 잡힌다.
 * 8월 청구(연체, 납부 0건)는 어느 달에도 잡히지 않는다 — 아직 들어온 돈이 아니다.
 *
 * ## ② 월 경계는 **KST 달력**
 *
 * `paidAt` 은 타임스탬프(UTC 저장)고 장부의 "몇 월"은 한국 달력이다. 둘을 그냥 이으면
 * 매달 말일 15:00Z~24:00Z(= KST 다음 달 0~9시)에 들어온 납부가 한 달 앞으로 밀린다.
 * 그래서 버킷 판정은 예외 없이 엔진의 `kstYearMonth(paidAt)` 한 곳에서만 한다.
 * DB 조회 범위도 같은 경계를 써야 하므로 `kstYearRange(year)` 가 UTC 구간으로 바꿔 준다
 * (2026년 = `2025-12-31T15:00Z` 이상 ~ `2026-12-31T15:00Z` 미만).
 *
 * ## ③ 이월분(`carriedOver`)은 **납부한 달**의 수입으로 잡고, 항목을 따로 둔다
 *
 * 논쟁 여지가 있는 지점이라 근거를 남긴다.
 * - 이 장부는 **현금 흐름 뷰**다. 기준이 이미 `paidAt` 이므로 이월분만 과거 월로 소급하면
 *   기준이 두 개가 된다. 소급하면 **이미 보여 준 과거 달의 합계가 나중에 바뀐다** —
 *   장부가 뒤로 흔들리면 임대인이 신뢰할 수 없다.
 * - 대신 이월분을 그 달 월세에 섞지 않고 **「전월 이월」 항목으로 분리**한다.
 *   섞으면 늦게 받은 달의 월세가 부풀어 보인다. 분리해 두면 "이 달 순수 월세"와
 *   "지난 달 밀린 것을 이제 받은 것"을 둘 다 읽을 수 있다.
 * - 발생주의(청구 월 기준) 장부가 필요하면 원본인 `RentCharge` 가 그대로 남아 있다.
 *   T6.2(어드민 지표)가 다른 기준이 필요하면 같은 원장에서 다시 집계하면 된다.
 *
 * ## ④ 합계 불변식
 *
 * `total = rent + maintenance + carriedOver + lateFee + excess` 이고,
 * 한 달의 `total` 은 그 달 `paidAt` 을 가진 **납부액 합계와 정확히 같다**.
 * `excess`(총액 초과 납부분)를 버리지 않고 담는 이유가 이 불변식이다 —
 * T1.5 가 초과 납부를 400 으로 막으므로 정상 흐름에서는 항상 0 이다.
 */
import {
  allocatePayments,
  kstYearMonth,
  KST_OFFSET_MS,
  type ChargeAmounts,
  type PaymentLike,
} from "@/lib/rent";

/** 한 버킷(월·건물·연간)의 항목별 금액. 전부 원 단위 정수. */
export type LedgerAmounts = {
  /** 월세로 충당된 금액 */
  rent: number;
  /** 관리비로 충당된 금액 */
  maintenance: number;
  /** 전월 이월(밀린 금액)로 충당된 금액 */
  carriedOver: number;
  /** 연체료로 충당된 금액 */
  lateFee: number;
  /** 청구 총액을 넘겨 받은 금액. 정상 흐름에서는 0 */
  excess: number;
  /** 위 다섯의 합 = 그 버킷에 실제로 들어온 돈 */
  total: number;
  /** 집계에 들어간 납부 건수 */
  paymentCount: number;
};

/** 월 버킷 — `month` 는 1~12 (KST 달력 기준) */
export type LedgerMonthBucket = LedgerAmounts & { month: number };

/** 건물 1채의 12개월 행 (월×건물 matrix 의 한 줄) */
export type LedgerBuildingBucket = {
  buildingId: string;
  months: LedgerMonthBucket[];
  totals: LedgerAmounts;
};

export type LedgerAggregate = {
  year: number;
  /** 12개월 합계(건물 전체). 납부가 없는 달도 0 으로 채워 항상 12개다 */
  months: LedgerMonthBucket[];
  /** 월×건물 matrix — 입력 `buildingIds` 순서 그대로, 수입이 없는 건물도 0 행으로 남는다 */
  buildings: LedgerBuildingBucket[];
  /** 연간 항목별 합계 */
  totals: LedgerAmounts;
};

/** 집계에 필요한 납부 1건 — `paidAt` 이 **필수**다(월 버킷 판정 기준). */
export type LedgerPaymentInput = PaymentLike & { paidAt: Date };

/**
 * 집계에 필요한 청구 1건.
 * 충당 계산은 그 청구의 **모든 납부**를 누적으로 봐야 하므로 연도로 잘라 넣으면 안 된다
 * (앞선 납부가 이월·연체료를 먼저 지우기 때문). 연도 필터는 버킷 단계에서만 건다.
 */
export type LedgerChargeInput = ChargeAmounts & {
  /** 이 청구가 속한 건물 — matrix 행을 고르는 키 */
  buildingId: string;
  payments: readonly LedgerPaymentInput[];
};

const MONTHS_IN_YEAR = 12;

export function emptyLedgerAmounts(): LedgerAmounts {
  return { rent: 0, maintenance: 0, carriedOver: 0, lateFee: 0, excess: 0, total: 0, paymentCount: 0 };
}

function emptyMonths(): LedgerMonthBucket[] {
  return Array.from({ length: MONTHS_IN_YEAR }, (_, index) => ({
    month: index + 1,
    ...emptyLedgerAmounts(),
  }));
}

/**
 * 12개월 배열에서 그 달 버킷을 꺼낸다.
 * `month` 는 `kstYearMonth` 가 준 1~12 라 벗어날 수 없지만, 인덱스 접근이 `undefined` 를
 * 낼 수 있다는 타입 규칙(`noUncheckedIndexedAccess`)을 조용한 `!` 대신 여기서 한 번만 푼다.
 */
function bucketOf(months: LedgerMonthBucket[], month: number): LedgerMonthBucket {
  const bucket = months[month - 1];
  if (!bucket) throw new RangeError(`월 버킷이 없습니다: ${month}`);
  return bucket;
}

/** 두 버킷을 제자리에서 더한다(합계 열·연간 합계용). */
function addInto(target: LedgerAmounts, source: LedgerAmounts): void {
  target.rent += source.rent;
  target.maintenance += source.maintenance;
  target.carriedOver += source.carriedOver;
  target.lateFee += source.lateFee;
  target.excess += source.excess;
  target.total += source.total;
  target.paymentCount += source.paymentCount;
}

/**
 * **KST 달력 연도**를 UTC 타임스탬프 구간으로 바꾼다 — `[from, to)`.
 *
 * `paidAt` 은 `@db.Date` 가 아니라 타임스탬프라 UTC 자정으로 자르면 안 된다.
 * KST 2026-01-01 00:00 은 UTC 2025-12-31 15:00 이다. 이 9시간을 빼먹으면
 * 1월 1일 새벽 납부가 전년도로, 12월 31일 밤 납부가 이듬해로 새어 나간다.
 */
export function kstYearRange(year: number): { from: Date; to: Date } {
  return {
    from: new Date(Date.UTC(year, 0, 1) - KST_OFFSET_MS),
    to: new Date(Date.UTC(year + 1, 0, 1) - KST_OFFSET_MS),
  };
}

/**
 * 청구·납부 → 월별·항목별·건물별 집계.
 *
 * 항목 배분은 전부 `allocatePayments`(원장 엔진)가 한다 — 이 함수는 **버킷에 담기만** 한다.
 * `paidAt` 의 KST 연도가 `year` 와 다른 납부는 그냥 건너뛴다(청구 전체를 넣어도 안전하다).
 */
export function aggregateLedger(input: {
  year: number;
  charges: readonly LedgerChargeInput[];
  /** matrix 에 남길 건물 — 수입이 없어도 0 행으로 나온다. 순서가 곧 응답 순서 */
  buildingIds: readonly string[];
}): LedgerAggregate {
  const { year, charges } = input;

  const overall = emptyMonths();
  const perBuilding = new Map<string, LedgerMonthBucket[]>();
  for (const buildingId of input.buildingIds) {
    if (!perBuilding.has(buildingId)) perBuilding.set(buildingId, emptyMonths());
  }

  for (const charge of charges) {
    // ★ 항목 배분은 엔진의 충당 순서(이월 → 연체료 → 관리비 → 월세)를 그대로 따른다
    for (const { payment, allocation } of allocatePayments(charge, charge.payments)) {
      const bucketYm = kstYearMonth(payment.paidAt); // ★ 월 경계는 KST 달력
      if (bucketYm.year !== year) continue;

      const delta: LedgerAmounts = {
        rent: allocation.rent,
        maintenance: allocation.maintenance,
        carriedOver: allocation.carriedOver,
        lateFee: allocation.lateFee,
        excess: allocation.excess,
        total:
          allocation.rent +
          allocation.maintenance +
          allocation.carriedOver +
          allocation.lateFee +
          allocation.excess,
        paymentCount: 1,
      };

      addInto(bucketOf(overall, bucketYm.month), delta);

      let months = perBuilding.get(charge.buildingId);
      if (!months) {
        // 입력 목록에 없던 건물(있을 수 없지만 방어) — 합계에서 빠지지 않게 행을 만든다
        months = emptyMonths();
        perBuilding.set(charge.buildingId, months);
      }
      addInto(bucketOf(months, bucketYm.month), delta);
    }
  }

  const totals = emptyLedgerAmounts();
  for (const month of overall) addInto(totals, month);

  const buildings: LedgerBuildingBucket[] = [...perBuilding].map(([buildingId, months]) => {
    const buildingTotals = emptyLedgerAmounts();
    for (const month of months) addInto(buildingTotals, month);
    return { buildingId, months, totals: buildingTotals };
  });

  return { year, months: overall, buildings, totals };
}
