/**
 * `POST /api/auth/otp/request` — 모의 OTP 발급.
 *
 * 데모라 실제 SMS 발송이 없다. 6자리 코드를 **응답 본문에 그대로 담고**
 * 발송 로그(`MessageLog(kind=OTP)`)에도 남긴다. 실서비스라면 절대 하면 안 되는 일이지만,
 * 데모에서는 아무 번호로나 로그인·가입 흐름을 시연해야 하므로 의도적으로 노출한다.
 */
import { z } from "zod";
import { ok, parseJson } from "@/lib/api/response";
import { issueOtp } from "@/lib/auth/otp";
import { phoneSchema } from "@/lib/phone";

const bodySchema = z.object({ phone: phoneSchema });

export async function POST(request: Request): Promise<Response> {
  const parsed = await parseJson(request, bodySchema);
  if (parsed.response) return parsed.response;

  const otp = await issueOtp(parsed.data.phone);

  return ok({
    phone: otp.phone,
    // 데모 노출: 화면에 그대로 보여주는 인증번호
    code: otp.code,
    expiresAt: otp.expiresAt,
  });
}
