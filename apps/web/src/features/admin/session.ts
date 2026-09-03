/**
 * **어드민 로그인** — 어드민 앱(3001)이 쓰는 세션 발급 규칙 (T6.3).
 *
 * ## 무엇을 닫는가
 *
 * T2.5·T4.2·T1.4 는 web API 를 `User.isAdmin` 으로 단단히 잠갔지만 **어드민 앱 자체에는
 * 로그인이 없었다** — URL 을 아는 사람은 심사 화면도, 크론 버튼도 그냥 열 수 있었다.
 * 여기가 그 문을 닫는다.
 *
 * ## 왜 "시크릿 분기를 지운다"(T2.5 메모)가 아니라 로그인을 새로 다는가
 *
 * T2.5 는 "T6.3 이 `resolveServiceAdmin` 분기를 지우면 된다" 고 적어 뒀다. 그 말은
 * **절반만 맞다.**
 *
 * - 시크릿 분기는 **구멍이 아니다.** web API 는 시크릿이 없으면 401/403 이고, 시크릿이 맞아도
 *   실재하는 `isAdmin` 계정을 찾아야 통과한다. 즉 시크릿을 지운다고 어드민 앱이 잠기지 않는다.
 * - 열려 있는 것은 **어드민 앱의 문**이다. 문을 닫는 일과 시크릿을 지우는 일은 별개다.
 * - 게다가 시크릿 경로는 아직 필요하다 — Vercel Cron 이 `CRON_SECRET` 으로 `/api/cron/daily` 를
 *   부르고, 어드민 `/cron`·`/deals` 화면이 같은 값을 쓴다. 사람이 없는 호출에는 세션이 없다.
 *
 * 그래서 **문을 새로 달되, 그 문 뒤의 신분은 지금까지와 똑같이 `User.isAdmin`** 으로 둔다.
 * 시크릿은 "이 요청이 어드민 서버에서 왔다" 만 증명하는 서비스 자격으로 남는다.
 *
 * ## 로그인 방식: 관리자 전화번호 + 어드민 패스코드
 *
 * | 입력 | 무엇을 증명하나 |
 * |---|---|
 * | **관리자 전화번호** | *누구인지* — DB 의 `isAdmin: true` 계정을 고른다. 세션은 그 사람의 것이 된다 |
 * | **어드민 패스코드** | *들어와도 되는지* — 인터넷에서 얻을 수 없는 값(서버 환경변수) |
 *
 * **왜 OTP 가 아닌가.** 데모의 OTP 는 `POST /api/auth/otp/request` 가 **코드를 응답에 그대로
 * 실어 준다**(T0.3, 의도된 데모 장치다). 즉 누구든 관리자 번호로 코드를 받아 낼 수 있어,
 * OTP 로 어드민 문을 잠그면 잠근 척만 하게 된다. 패스코드는 공개 API 로 얻을 수 없다 —
 * 데모에 필요한 최소한이면서 "URL 만 알면 열린다" 를 실제로 막는 유일한 값이다.
 *
 * **패스코드가 설정돼 있지 않으면 로그인은 전부 거부된다(fail closed).** 환경변수를 빠뜨린
 * 배포가 "인증 없음" 으로 열리는 것이 이 task 가 없애려는 바로 그 상태이기 때문이다.
 *
 * ## 세션의 실체는 브라우저 로그인과 같다
 *
 * 발급되는 것은 web 의 `Session` 레코드 그대로다(같은 테이블·같은 30일 TTL·같은 `getCurrentUser`).
 * 어드민 앱은 그 토큰을 **자기 도메인의 httpOnly 쿠키**에 담고, web 을 부를 때 `Cookie` 헤더로
 * 되돌려 준다. 도메인이 달라 쿠키를 공유할 수 없을 뿐, 인증 체계는 하나다.
 */
import { timingSafeEqual } from "node:crypto";
import { prisma, type User } from "@zari/db";
import { issueSessionToken, revokeSessionToken } from "@/lib/auth/session";

/** 어드민 앱이 "나는 어드민 서버다" 를 증명하는 헤더 값 */
export function adminServiceSecret(): string | undefined {
  return process.env.ADMIN_API_SECRET || process.env.CRON_SECRET || undefined;
}

/**
 * 운영자가 입력하는 패스코드.
 *
 * 전용 값(`ADMIN_PASSWORD`)이 우선이고, 없으면 서비스 시크릿과 같은 값으로 떨어진다 —
 * 로컬·데모에 이미 있는 값이라 **새 환경변수를 요구하지 않기 위해서**다(T2.5 가 시크릿에서
 * 쓴 것과 같은 판단). 운영에서는 사람이 치는 값과 서버가 쓰는 값을 반드시 나눈다.
 */
export function adminPasscode(): string | undefined {
  return process.env.ADMIN_PASSWORD || adminServiceSecret();
}

/** 길이가 달라도 새어 나가지 않게 상수 시간 비교 */
export function secretEquals(a: string | undefined | null, b: string | undefined | null): boolean {
  if (!a || !b) return false;
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) {
    // 길이가 다르면 어차피 불일치지만, 같은 길이일 때와 시간이 크게 다르지 않도록 한 번은 비교한다
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

export type AdminSignInResult =
  | { ok: true; user: User; token: string; expiresAt: Date }
  /** 왜 실패했는지는 **밖으로 구분해 주지 않는다** — 번호 존재 여부를 떠보지 못하게 */
  | { ok: false; reason: "NOT_CONFIGURED" | "BAD_PASSCODE" | "NOT_ADMIN" };

/**
 * 어드민 로그인 — 패스코드 확인 → `isAdmin` 계정 확인 → 세션 토큰 발급.
 *
 * 실패 사유는 로그·테스트용으로만 나뉘고, 라우트는 **전부 같은 403 문구**로 돌려준다.
 */
export async function signInAdmin(input: {
  phone: string;
  passcode: string;
}): Promise<AdminSignInResult> {
  const expected = adminPasscode();
  if (!expected) return { ok: false, reason: "NOT_CONFIGURED" };
  if (!secretEquals(input.passcode, expected)) return { ok: false, reason: "BAD_PASSCODE" };

  const user = await prisma.user.findUnique({ where: { phone: input.phone } });
  if (!user || !user.isAdmin) return { ok: false, reason: "NOT_ADMIN" };

  const { token, expiresAt } = await issueSessionToken(user.id);
  return { ok: true, user, token, expiresAt };
}

/** 로그아웃 — 어드민 앱이 들고 있던 토큰을 폐기한다. 없는 토큰이어도 조용히 성공(멱등). */
export async function signOutAdmin(token: string | undefined | null): Promise<void> {
  if (!token) return;
  await revokeSessionToken(token);
}
