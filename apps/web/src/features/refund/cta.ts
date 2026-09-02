/**
 * 환급 계산기 「신청하기」 CTA 의 목적지 (T2.3).
 *
 * 계산기는 **비로그인 공개**라 CTA 가 곧 가입 퍼널의 입구다(공개 고지서 T1.8 과 같은 역할).
 * 그래서 목적지를 상태에 따라 나눈다:
 *
 * | 상태 | 목적지 |
 * |---|---|
 * | 로그인 | `/tenant/refund/apply` (T2.4 — 아직 없어서 404 가 정상이다) |
 * | 비로그인 | `/login?from=refund_calculator&next=<신청 경로>` |
 *
 * ## 어디서 왔는지를 어떻게 잇나 — T1.8 과 같은 방식
 *
 * 1. **anonId 로 잇는다(본선)** — `zari_anon` 1st-party 쿠키(T0.7)가 계산기 → 로그인 →
 *    온보딩까지 같은 값으로 유지되므로 퍼널이 한 방문자로 묶인다.
 * 2. **쿼리로 출처를 남긴다(보조)** — `page_view` 가 쿼리까지 포함한 경로를 기록하므로
 *    (`lib/tracking/page-view.tsx`) 로그인·가입 이벤트의 `path` 에 "환급 계산기에서 왔다"가 남는다.
 *    로그인 화면(T0.4 소유)은 아직 이 값을 읽지 않는다 — **그 파일을 건드리지 않고**
 *    출처를 잇기 위한 선택이고, T1.8 이 `from=notice` 로 푼 문제와 같은 방식이다.
 *
 * 계산 입력을 `next` 에 실어 보내므로, T2.4 가 `/tenant/refund/apply` 를 만들 때
 * **쿼리만 읽으면 신청서를 그대로 채울 수 있다**(같은 값을 `calculateRefund` 에 넣으면
 * 계산기가 보여 준 금액이 그대로 재현된다).
 */
import type { RefundCalcInput } from "./calc";

/** T2.4 가 만들 신청 화면. 지금은 없으므로 로그인 상태에서 눌러도 404 가 정상이다. */
export const REFUND_APPLY_PATH = "/tenant/refund/apply";

/** 공개 계산기 경로 — 화면·트래킹·메타에서 같은 문자열을 쓴다. */
export const REFUND_CALCULATOR_PATH = "/refund/calculator";

/** 로그인 화면에 남기는 출처 값(`?from=`). `page_view` 의 path 에 그대로 실린다. */
export const REFUND_CTA_SOURCE = "refund_calculator";

/** 계산 입력을 실은 신청 화면 경로 — T2.4 가 쿼리를 읽어 신청서를 채운다. */
export function refundApplyHref(input: RefundCalcInput): string {
  const params = new URLSearchParams({
    grossSalary: String(input.grossSalary),
    monthlyRent: String(input.monthlyRent),
    startDate: input.startDate,
    endDate: input.endDate,
  });
  return `${REFUND_APPLY_PATH}?${params.toString()}`;
}

/** 로그인 상태면 신청 화면, 비로그인이면 로그인 화면(돌아올 곳을 `next` 로 들고 간다). */
export function refundCtaHref(input: RefundCalcInput, loggedIn: boolean): string {
  const apply = refundApplyHref(input);
  if (loggedIn) return apply;

  const params = new URLSearchParams({ from: REFUND_CTA_SOURCE, next: apply });
  return `/login?${params.toString()}`;
}

/** 버튼 문구도 상태에 따라 다르다 — 비로그인에게는 "가입"이라고 미리 알린다. */
export function refundCtaLabel(loggedIn: boolean): string {
  return loggedIn ? "환급 신청하기" : "가입하고 환급 신청하기";
}
