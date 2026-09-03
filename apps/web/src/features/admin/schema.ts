/**
 * 어드민 조회 API 의 쿼리 스키마 (T6.3).
 *
 * 공통 규칙 두 가지:
 * - **페이지네이션은 `pageQueryShape` 를 섞어 쓴다** — 다섯 화면이 같은 `page`·`pageSize` 규약을 쓴다.
 * - **여러 값을 받는 필터는 콤마로 이어 보내고, 모르는 값은 조용히 버린다.** 400 을 내면 화면이
 *   막히는데, 이 필터들은 "보여 줄 것을 좁히는" 용도라 못 알아듣는 값은 없는 셈 치는 편이 낫다
 *   (T2.5 환급 큐·T4.2 신고 큐가 같은 규칙이다). 반대로 `page`·`pageSize` 는 잘못되면 **400** 이다 —
 *   그건 "무엇을 보여 줄지" 가 아니라 "어디를 보여 줄지" 라 조용히 넘기면 엉뚱한 화면이 나온다.
 */
import { z } from "zod";
import { pageQueryShape } from "./pagination";
import { isDateKey } from "./period";

/** 콤마로 이어진 목록을 허용 집합으로 걸러 낸다. 남는 게 없으면 `undefined`(필터 없음) */
function csvEnum<T extends string>(allowed: readonly T[]) {
  return z
    .string()
    .optional()
    .transform((raw) => {
      if (!raw) return undefined;
      const picked = raw
        .split(",")
        .map((value) => value.trim())
        .filter((value): value is T => (allowed as readonly string[]).includes(value));
      return picked.length > 0 ? Array.from(new Set(picked)) : undefined;
    });
}

/** 자유 문자열 필터 — 앞뒤 공백을 떼고, 비면 `undefined` */
const searchText = z
  .string()
  .max(100)
  .optional()
  .transform((raw) => {
    const trimmed = raw?.trim();
    return trimmed ? trimmed : undefined;
  });

export const LEASE_STATUSES = ["PENDING_TENANT", "ACTIVE", "ENDED", "CANCELLED"] as const;
export const CHARGE_STATUSES = ["SCHEDULED", "PARTIALLY_PAID", "PAID", "OVERDUE"] as const;
export const MESSAGE_KINDS = [
  "RENT_NOTICE",
  "OVERDUE_NOTICE",
  "CONTRACT_EXPIRY",
  "BROKERAGE_REQUEST",
  "WORK_ORDER_REQUEST",
  "OTP",
  "ETC",
] as const;

export const adminUsersQuerySchema = z.object({
  q: searchText,
  ...pageQueryShape,
});

export const adminLeasesQuerySchema = z.object({
  q: searchText,
  status: csvEnum(LEASE_STATUSES),
  /** `?overdue=1` — 연체 청구가 하나라도 있는 계약만 */
  overdue: z
    .string()
    .optional()
    .transform((raw) => raw === "1" || raw === "true"),
  ...pageQueryShape,
});

export const adminChargesQuerySchema = z.object({
  status: csvEnum(CHARGE_STATUSES),
  leaseId: z.string().min(1).max(50).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  ...pageQueryShape,
});

export const adminMessagesQuerySchema = z.object({
  kind: csvEnum(MESSAGE_KINDS),
  /** 수신자 — 이름이 아니라 번호로 찾는다(발송 로그에는 이름이 없다) */
  q: searchText,
  opened: z.enum(["all", "opened", "unopened"]).optional().default("all"),
  ...pageQueryShape,
});

const dateKey = z
  .string()
  .optional()
  .transform((raw) => (raw && isDateKey(raw) ? raw : undefined));

export const adminEventsQuerySchema = z.object({
  /** 이벤트 이름 — 콤마로 여러 개. 목록은 응답의 `names` 가 준다 */
  name: z
    .string()
    .max(400)
    .optional()
    .transform((raw) => {
      if (!raw) return undefined;
      const picked = raw
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value.length > 0 && value.length <= 60);
      return picked.length > 0 ? Array.from(new Set(picked)) : undefined;
    }),
  /** KST 달력 날짜 `YYYY-MM-DD`. 형식이 아니면 없는 셈 치고 기본 구간(최근 7일)을 쓴다 */
  from: dateKey,
  to: dateKey,
  ...pageQueryShape,
});

/** 어드민 로그인 본문 */
export const adminSignInSchema = z.object({
  phone: z.string().min(1).max(30),
  passcode: z.string().min(1).max(200),
});

export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;
export type AdminLeasesQuery = z.infer<typeof adminLeasesQuerySchema>;
export type AdminChargesQuery = z.infer<typeof adminChargesQuerySchema>;
export type AdminMessagesQuery = z.infer<typeof adminMessagesQuerySchema>;
export type AdminEventsQuery = z.infer<typeof adminEventsQuerySchema>;
