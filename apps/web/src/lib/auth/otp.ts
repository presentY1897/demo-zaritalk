/**
 * 모의 OTP + 가입 티켓 (T0.3).
 *
 * ## 모의 OTP
 * 데모에는 실제 SMS 발송이 없다. 발급한 6자리 코드는 응답 본문과 발송 로그
 * (`MessageLog(kind=OTP)`) 양쪽에 그대로 노출된다 — 데모에서 아무 번호로나
 * 로그인 흐름을 시연하기 위한 의도적인 설계이며, 실서비스에서는 절대 금지다.
 *
 * ## 가입 티켓 (스키마 추가 없이 해결)
 * 신규 번호는 검증에 성공해도 세션을 주지 않고 온보딩(T0.4)으로 보낸다.
 * 이때 필요한 단기 토큰(가입 티켓)은 **검증 완료된 `OtpCode` 레코드의 id** 를 그대로 쓴다.
 * 새 모델을 추가하지 않기 위해 기존 컬럼 두 개의 의미를 검증 전/후로 나눠 쓴다.
 *
 * | 컬럼 | 검증 전 | 검증 후 |
 * |---|---|---|
 * | `verifiedAt` | null | 검증 시각 — 코드 재사용 차단 |
 * | `expiresAt` | 코드 만료(5분) | **티켓 만료(10분)**, 기존 회원이면 즉시 만료 |
 *
 * 티켓은 1회용이라 소진(`consumeSignupTicket`) 시 레코드를 삭제한다.
 * 따라서 "없음"과 "이미 쓴 티켓"은 같은 `NOT_FOUND` 로 취급한다.
 */
import { MessageKind, prisma, type Profile, type User } from "@zari/db";

/** 인증번호 유효시간 — 5분 */
export const OTP_TTL_MS = 5 * 60 * 1000;
/** 가입 티켓 유효시간 — 10분(온보딩 입력 시간) */
export const SIGNUP_TICKET_TTL_MS = 10 * 60 * 1000;

/** 6자리 인증번호. 데모라 예측 가능성보다 자릿수 고정이 중요하다. */
export function generateOtpCode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String((buf[0] ?? 0) % 1_000_000).padStart(6, "0");
}

export type IssuedOtp = {
  id: string;
  phone: string;
  /** 데모 노출용 평문 코드 */
  code: string;
  expiresAt: Date;
};

/** 인증번호 발급 — `OtpCode` 생성 + 발송 로그(`MessageKind.OTP`) 기록. */
export async function issueOtp(phone: string): Promise<IssuedOtp> {
  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  const otp = await prisma.otpCode.create({ data: { phone, code, expiresAt } });

  // 알림톡 시뮬레이터: 실제 발송 대신 로그로 남기고, 데모에서는 이 로그가 곧 "받은 문자"다.
  await prisma.messageLog.create({
    data: {
      kind: MessageKind.OTP,
      toPhone: phone,
      title: "[자리톡] 인증번호",
      body: `인증번호 ${code} 를 5분 안에 입력해 주세요.`,
    },
  });

  return { id: otp.id, phone, code, expiresAt };
}

export type OtpFailureReason =
  /** 해당 번호로 발급된 적 없는 코드 (오입력) */
  | "INVALID"
  /** 발급됐지만 5분이 지난 코드 */
  | "EXPIRED"
  /** 이미 검증에 쓴 코드 (재사용) */
  | "ALREADY_USED";

export type OtpVerification =
  /** 기존 회원 — 바로 세션을 발급하면 된다 */
  | { ok: true; kind: "USER"; user: User & { profiles: Profile[] } }
  /** 신규 번호 — 세션 대신 가입 티켓을 주고 온보딩(T0.4)으로 보낸다 */
  | { ok: true; kind: "SIGNUP"; phone: string; ticket: string; ticketExpiresAt: Date }
  | { ok: false; reason: OtpFailureReason };

/**
 * 인증번호 검증 + 소비.
 *
 * 성공하면 `verifiedAt` 을 찍어 재사용을 막고, 신규 번호면 `expiresAt` 을 티켓
 * 유효시간으로 연장해 그 레코드 id 를 가입 티켓으로 돌려준다. 기존 회원이면
 * 티켓으로 쓸 수 없도록 `expiresAt` 을 즉시 만료시킨다.
 *
 * 검사 순서는 재사용 → 만료다. 검증 후에는 `expiresAt` 의미가 티켓 만료로 바뀌므로,
 * 이미 쓴 코드는 만료가 아니라 재사용으로 보고해야 한다.
 */
export async function verifyOtp(phone: string, code: string): Promise<OtpVerification> {
  const otp = await prisma.otpCode.findFirst({
    where: { phone, code },
    orderBy: { createdAt: "desc" },
  });

  if (!otp) return { ok: false, reason: "INVALID" };
  if (otp.verifiedAt) return { ok: false, reason: "ALREADY_USED" };
  if (otp.expiresAt.getTime() <= Date.now()) return { ok: false, reason: "EXPIRED" };

  const user = await prisma.user.findUnique({
    where: { phone },
    include: { profiles: { orderBy: { createdAt: "asc" } } },
  });
  const now = new Date();
  const ticketExpiresAt = user ? now : new Date(now.getTime() + SIGNUP_TICKET_TTL_MS);

  await prisma.otpCode.update({
    where: { id: otp.id },
    data: { verifiedAt: now, expiresAt: ticketExpiresAt },
  });

  if (user) return { ok: true, kind: "USER", user };
  return { ok: true, kind: "SIGNUP", phone, ticket: otp.id, ticketExpiresAt };
}

export type SignupTicketFailureReason =
  /** 없는 티켓 또는 이미 소진된 티켓 */
  | "NOT_FOUND"
  /** OTP 검증을 거치지 않은 레코드 id */
  | "NOT_VERIFIED"
  /** 티켓 유효시간(10분) 초과 — 기존 회원의 검증 기록도 여기에 걸린다 */
  | "EXPIRED";

export type SignupTicketResult =
  | { ok: true; phone: string; expiresAt: Date }
  | { ok: false; reason: SignupTicketFailureReason };

/**
 * 가입 티켓 검증(소진하지 않음) — 온보딩 화면에서 번호를 미리 채울 때 쓴다.
 * T0.4 `POST /api/profiles` 는 실제 가입 시 `consumeSignupTicket` 을 쓴다.
 */
export async function verifySignupTicket(ticket: string): Promise<SignupTicketResult> {
  const otp = await prisma.otpCode.findUnique({ where: { id: ticket } });
  if (!otp) return { ok: false, reason: "NOT_FOUND" };
  if (!otp.verifiedAt) return { ok: false, reason: "NOT_VERIFIED" };
  if (otp.expiresAt.getTime() <= Date.now()) return { ok: false, reason: "EXPIRED" };
  return { ok: true, phone: otp.phone, expiresAt: otp.expiresAt };
}

/**
 * 가입 티켓 검증 + 소진(1회용). 성공하면 레코드를 삭제해 재사용을 막는다.
 * 가입 트랜잭션 안에서 User 생성 직전에 호출한다.
 */
export async function consumeSignupTicket(ticket: string): Promise<SignupTicketResult> {
  const result = await verifySignupTicket(ticket);
  if (!result.ok) return result;
  await prisma.otpCode.delete({ where: { id: ticket } });
  return result;
}
