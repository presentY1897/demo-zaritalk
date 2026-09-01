/**
 * `POST /api/auth/otp/verify` — 인증번호 검증.
 *
 * - 기존 회원: 세션 발급(httpOnly 쿠키) + `/api/me` 와 같은 형태의 사용자 정보 반환
 * - 신규 번호: 세션을 주지 않고 **가입 티켓**(단기 토큰) 반환 → 온보딩(T0.4)에서 소진
 *
 * 실패는 사유별로 코드를 나눈다: 오코드 `OTP_INVALID`, 만료 `OTP_EXPIRED`,
 * 재사용 `OTP_ALREADY_USED`.
 */
import { z } from "zod";
import { fail, ok, parseJson } from "@/lib/api/response";
import { buildMeResponse } from "@/lib/auth/me";
import { verifyOtp } from "@/lib/auth/otp";
import { loginUser } from "@/lib/auth/session";
import { phoneSchema } from "@/lib/phone";

const bodySchema = z.object({
  phone: phoneSchema,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "인증번호는 6자리 숫자입니다."),
});

export async function POST(request: Request): Promise<Response> {
  const parsed = await parseJson(request, bodySchema);
  if (parsed.response) return parsed.response;

  const result = await verifyOtp(parsed.data.phone, parsed.data.code);

  if (!result.ok) {
    switch (result.reason) {
      case "INVALID":
        return fail("OTP_INVALID", "인증번호가 올바르지 않습니다.");
      case "EXPIRED":
        return fail("OTP_EXPIRED", "인증번호가 만료됐습니다. 다시 요청해 주세요.");
      case "ALREADY_USED":
        return fail("OTP_ALREADY_USED", "이미 사용한 인증번호입니다. 다시 요청해 주세요.");
    }
  }

  if (result.kind === "SIGNUP") {
    return ok({
      status: "SIGNUP_REQUIRED" as const,
      phone: result.phone,
      signupTicket: result.ticket,
      ticketExpiresAt: result.ticketExpiresAt,
    });
  }

  await loginUser(result.user);
  return ok({ status: "SESSION" as const, ...(await buildMeResponse(result.user)) });
}
