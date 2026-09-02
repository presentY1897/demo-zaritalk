/**
 * 환급 계산 요청 스키마 (T2.3) — `POST /api/refund/calculate` 본문.
 *
 * `@zari/db` 를 import 하지 않는다. **클라이언트 폼과 API 가 같은 스키마로 막는다**
 * (계약 폼 T1.2 와 같은 방식) — 화면에서 걸린 값이 서버에서 통과하거나 그 반대가 되면 안 된다.
 *
 * 여기서 막는 것은 **형식과 부호**뿐이다. "오늘"이 필요한 판정(미래 시작일)은
 * 시계를 알아야 하므로 라우트가 `asOf` 를 주입해서 처리한다(`calc.ts` 의 `isFutureStart`).
 * [T2.4](../../../../../docs/tasks/t2.4-refund-apply.md) 는 이 스키마를 신청서 본문에 그대로 얹으면 된다.
 */
import { z } from "zod";

/** 금액(원) — 0원·음수는 거부한다. 상한은 다른 금액 필드(T1.2)와 같은 20억. */
const grossSalarySchema = z
  .number()
  .int("총급여는 원 단위 정수로 입력해 주세요.")
  .positive("총급여는 1원 이상이어야 합니다.")
  .max(2_000_000_000, "총급여가 너무 큽니다.");

const monthlyRentSchema = z
  .number()
  .int("월세는 원 단위 정수로 입력해 주세요.")
  .positive("월세는 1원 이상이어야 합니다.")
  .max(2_000_000_000, "월세가 너무 큽니다.");

/** `YYYY-MM-DD` — UTC 자정 Date 변환·존재하는 날짜인지는 `parseDateOnly` 가 본다 */
const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "날짜는 YYYY-MM-DD 형식으로 입력해 주세요.");

export const refundCalcSchema = z
  .object({
    /** 연 총급여(원) */
    grossSalary: grossSalarySchema,
    /** 월세(원/월) */
    monthlyRent: monthlyRentSchema,
    startDate: dateOnlySchema,
    endDate: dateOnlySchema,
  })
  // `YYYY-MM-DD` 는 사전순 비교가 곧 날짜 비교다(T1.2 계약 스키마와 같은 방식)
  .refine((value) => value.startDate <= value.endDate, {
    message: "임차 종료일은 시작일보다 빠를 수 없습니다.",
    path: ["endDate"],
  });

export type RefundCalcRequest = z.infer<typeof refundCalcSchema>;
