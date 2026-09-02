/**
 * `POST /api/refund/calculate` — 월세 세액공제 환급 계산 (T2.3).
 *
 * **비로그인 공개다.** 세션을 보지 않는다 — `/refund/calculator` 가 SEO·유입 경로라
 * 가입 전에도 숫자를 볼 수 있어야 한다.
 *
 * **아무것도 저장하지 않는다.** prisma 를 import 하지 않는 유일한 도메인 라우트다.
 * 저장은 [T2.4 환급 신청](../../../../../../docs/tasks/t2.4-refund-apply.md)이 맡고,
 * 그때도 금액은 이 파일이 아니라 **같은 순수 함수** `calculateRefund` 에서 나온다.
 *
 * 이 파일이 하는 일은 셋뿐이다:
 * 1. zod 검증(`refundCalcSchema`) — 0원·음수·형식·기간 역전을 400 으로 막는다
 * 2. 달력에 없는 날짜(`2026-02-31`)와 **미래 시작일**을 400 으로 막는다
 * 3. `kstToday()` 를 기준일로 주입해 계산 함수를 부른다
 *
 * 기준일을 요청 본문으로 받지 않는 이유: 받으면 "오늘"이 호출자 마음대로가 되어
 * 소급 5년 경계를 밖에서 흔들 수 있다. 테스트는 시스템 시각을 고정해서 같은 효과를 낸다.
 */
import { parseDateOnly } from "@/features/lease/rules";
import { calculateRefund, isFutureStart } from "@/features/refund/calc";
import { refundCalcSchema } from "@/features/refund/schema";
import { fail, ok, parseJson } from "@/lib/api/response";
import { kstToday } from "@/lib/rent";

export async function POST(request: Request): Promise<Response> {
  const parsed = await parseJson(request, refundCalcSchema);
  if (parsed.response) return parsed.response;
  const input = parsed.data;

  // 스키마가 형식(YYYY-MM-DD)과 순서(시작 ≤ 종료)는 이미 막았다.
  // 여기서 걸리는 것은 "2026-02-31" 처럼 형식은 맞지만 존재하지 않는 날짜다(T1.2 와 같은 처리).
  if (!parseDateOnly(input.startDate) || !parseDateOnly(input.endDate)) {
    return fail("VALIDATION_ERROR", "존재하지 않는 날짜입니다.");
  }

  const asOf = kstToday();
  if (isFutureStart(input.startDate, asOf)) {
    return fail("VALIDATION_ERROR", "임차 시작일이 오늘보다 미래입니다. 날짜를 확인해 주세요.");
  }

  return ok({ result: calculateRefund(input, asOf) });
}
