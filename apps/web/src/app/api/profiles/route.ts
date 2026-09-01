/**
 * `POST /api/profiles` — 프로필 추가(유형별 Detail 포함) (T0.4).
 *
 * 두 가지 입구를 한 핸들러에서 처리한다.
 * - **가입 플로우**: 본문에 `signupTicket`(T0.3 OTP 검증으로 받은 1회용 티켓)이 있으면
 *   티켓의 전화번호로 User 를 만들고 프로필까지 생성한 뒤 **세션까지 발급**한다.
 * - **프로필 추가**: 로그인 상태면 기존 User 에 다른 유형 프로필을 붙인다.
 *
 * `Profile` 은 `@@unique([userId, type])` 이므로 같은 유형을 또 만들면 409 CONFLICT.
 * 응답의 `redirectTo` 는 세입자 대기 계약 판정 결과다(있으면 수락 화면 = T1.3).
 */
import { prisma } from "@zari/db";
import { created, fail, parseJson } from "@/lib/api/response";
import { PROFILE_TYPE_OPTIONS } from "@/features/profiles/constants";
import { resolveProfileRedirect } from "@/features/profiles/pending-lease";
import { createProfileSchema, type CreateProfileInput } from "@/features/profiles/schema";
import { buildMeResponse, type MeProfile } from "@/lib/auth/me";
import {
  consumeSignupTicket,
  verifySignupTicket,
  type SignupTicketFailureReason,
} from "@/lib/auth/otp";
import { getCurrentUser, loginUser, setActiveProfile } from "@/lib/auth/session";

/** 유형 라벨 — 에러 문구에 쓴다("이미 세입자 프로필이 있습니다") */
function typeLabel(type: CreateProfileInput["type"]): string {
  return PROFILE_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
}

function ticketFailureMessage(reason: SignupTicketFailureReason): string {
  switch (reason) {
    case "EXPIRED":
      return "가입 시간이 만료됐습니다. 인증번호부터 다시 받아 주세요.";
    case "NOT_VERIFIED":
      return "인증되지 않은 가입 요청입니다. 인증번호부터 다시 받아 주세요.";
    default:
      return "이미 사용했거나 유효하지 않은 가입 요청입니다. 처음부터 다시 진행해 주세요.";
  }
}

/** Prisma 유니크 제약 위반(동시 요청으로 뚫린 중복 유형) */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/** 유형별 Detail 을 같은 트랜잭션(중첩 create)으로 함께 만든다. */
function createProfileRow(userId: string, body: CreateProfileInput) {
  return prisma.profile.create({
    data: {
      userId,
      type: body.type,
      ...(body.type === "REALTOR" ? { realtorDetail: { create: body.realtor } } : {}),
      ...(body.type === "MASTER" ? { masterDetail: { create: body.master } } : {}),
    },
    include: { realtorDetail: true, masterDetail: true },
  });
}

type CreatedProfile = Awaited<ReturnType<typeof createProfileRow>>;

/** `GET /api/me` 의 프로필 항목과 같은 모양으로 맞춘다. */
function toMeProfile(profile: CreatedProfile): MeProfile {
  return {
    id: profile.id,
    type: profile.type,
    createdAt: profile.createdAt,
    realtorDetail: profile.realtorDetail,
    masterDetail: profile.masterDetail,
  };
}

/** 세션 발급·응답 조립에 쓰는 User(프로필 포함) 를 다시 읽는다. */
function loadSessionUser(userId: string) {
  return prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { profiles: { orderBy: { createdAt: "asc" } } },
  });
}

export async function POST(request: Request): Promise<Response> {
  const parsed = await parseJson(request, createProfileSchema);
  if (parsed.response) return parsed.response;
  const body = parsed.data;

  const userId = body.signupTicket
    ? await resolveSignupUser(body, body.signupTicket)
    : await resolveLoggedInUser(body);
  if (typeof userId !== "string") return userId;

  let profile: CreatedProfile;
  try {
    profile = await createProfileRow(userId, body);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return fail("CONFLICT", `이미 ${typeLabel(body.type)} 프로필이 있습니다.`);
    }
    throw error;
  }

  const user = await loadSessionUser(userId);
  if (body.signupTicket) {
    // 가입 확정 — 세션 발급 + 방금 만든 유형을 활성 프로필로
    await loginUser(user, body.type);
  } else {
    // 프로필 추가 — 방금 만든 프로필로 전환해 준다(전환 API 자체는 T0.5)
    await setActiveProfile(profile.id);
  }

  return created({
    profile: toMeProfile(profile),
    me: await buildMeResponse(user),
    redirectTo: await resolveProfileRedirect(user.phone, body.type),
  });
}

/**
 * 가입 플로우 — 티켓을 검증하고 User 를 준비한다.
 * 성공하면 userId, 실패하면 에러 Response 를 돌려준다.
 * 티켓 소진은 **중복 유형 검사 뒤**에 한다 — 409 로 튕길 요청에 티켓을 태우지 않기 위해서다.
 */
async function resolveSignupUser(
  body: CreateProfileInput,
  ticket: string,
): Promise<string | Response> {
  const checked = await verifySignupTicket(ticket);
  if (!checked.ok) return fail("SIGNUP_TICKET_INVALID", ticketFailureMessage(checked.reason));
  if (!body.name) return fail("VALIDATION_ERROR", "이름을 입력해 주세요.");

  const existing = await prisma.user.findUnique({
    where: { phone: checked.phone },
    include: { profiles: true },
  });
  if (existing?.profiles.some((p) => p.type === body.type)) {
    return fail("CONFLICT", `이미 ${typeLabel(body.type)} 프로필이 있습니다.`);
  }

  const consumed = await consumeSignupTicket(ticket);
  if (!consumed.ok) return fail("SIGNUP_TICKET_INVALID", ticketFailureMessage(consumed.reason));

  if (existing) return existing.id;
  const user = await prisma.user.create({ data: { phone: checked.phone, name: body.name } });
  return user.id;
}

/** 프로필 추가 — 로그인 상태여야 하고, 같은 유형이 이미 있으면 409. */
async function resolveLoggedInUser(body: CreateProfileInput): Promise<string | Response> {
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요합니다.");
  if (user.profiles.some((p) => p.type === body.type)) {
    return fail("CONFLICT", `이미 ${typeLabel(body.type)} 프로필이 있습니다.`);
  }
  // 이름을 함께 보내면 계정 이름도 갱신한다(온보딩에서 이름을 고칠 수 있게)
  if (body.name && body.name !== user.name) {
    await prisma.user.update({ where: { id: user.id }, data: { name: body.name } });
  }
  return user.id;
}
