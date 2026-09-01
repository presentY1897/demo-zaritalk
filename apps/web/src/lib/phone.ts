/**
 * 전화번호 정규화 — 저장·조회는 항상 숫자만 남긴 형태(하이픈 없음)로 통일한다.
 * 시드 데이터(`packages/db/prisma/seed.ts`)도 `01011111111` 형태를 쓴다.
 */
import { z } from "zod";

/** 숫자 외 문자(하이픈·공백·괄호)를 모두 제거한다. */
export function normalizePhone(input: string): string {
  return input.replace(/\D/g, "");
}

/** 국내 휴대폰 번호(01X-XXXX-XXXX) — 정규화 후 10~11자리. */
export const PHONE_PATTERN = /^01[016789]\d{7,8}$/;

export function isValidPhone(input: string): boolean {
  return PHONE_PATTERN.test(normalizePhone(input));
}

/**
 * 요청 본문용 zod 스키마. 입력에 하이픈이 있어도 받고, 파싱 결과는 정규화된 번호다.
 * 파싱을 통과한 값은 그대로 DB 조회·저장에 쓸 수 있다.
 */
export const phoneSchema = z
  .string()
  .transform(normalizePhone)
  .refine((v) => PHONE_PATTERN.test(v), { message: "휴대폰 번호 형식이 아닙니다." });

/** 화면 표시용 하이픈 포맷 — 01012345678 → 010-1234-5678 */
export function formatPhone(input: string): string {
  const digits = normalizePhone(input);
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return digits;
}
