/**
 * 세션 공용 헬퍼 — httpOnly 쿠키 + DB `Session` 레코드.
 *
 * 토큰 발급·폐기는 T0.3 인증 API가, 활성 프로필 전환은 T0.5가 쓴다.
 * 트래킹(T0.7)·보호 라우트는 `getCurrentUser()` 만 읽는다.
 */
import { cookies } from "next/headers";
import { prisma, type Profile, type ProfileType, type User } from "@zari/db";

export const SESSION_COOKIE = "zari_session";
export const ACTIVE_PROFILE_COOKIE = "zari_profile";
export const SESSION_TTL_DAYS = 30;

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  secure: process.env.NODE_ENV === "production",
} as const;

export type SessionUser = User & { profiles: Profile[] };

/**
 * 세션 토큰만 발급한다 — **쿠키를 건드리지 않는다** (T6.3).
 *
 * 어드민 앱(3001)은 web(3000)과 **다른 도메인**이라 web 이 구운 쿠키를 받을 수 없다.
 * 그래서 어드민 로그인(`POST /api/admin/session`)은 토큰을 **응답 본문으로** 돌려주고,
 * 어드민 서버가 그것을 자기 도메인 쿠키에 담는다. 세션의 실체(`Session` 레코드·TTL·판정)는
 * 브라우저 로그인과 **완전히 같다** — 다른 인증 체계를 하나 더 만들지 않기 위해서다.
 */
export async function issueSessionToken(
  userId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({ data: { token, userId, expiresAt } });
  return { token, expiresAt };
}

/** 토큰 하나를 폐기한다 — 쿠키를 못 지우는 곳(어드민 로그아웃)에서 쓴다. 없어도 조용히 넘어간다. */
export async function revokeSessionToken(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { token } });
}

/** 세션 발급 — DB 레코드 생성 + httpOnly 쿠키 설정. */
export async function createSession(userId: string): Promise<string> {
  const { token, expiresAt } = await issueSessionToken(userId);

  const store = await cookies();
  store.set(SESSION_COOKIE, token, { ...cookieOptions, expires: expiresAt });
  return token;
}

/** 세션 폐기 — DB 레코드 삭제 + 쿠키 제거. */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { token } });
  store.delete(SESSION_COOKIE);
  store.delete(ACTIVE_PROFILE_COOKIE);
}

/** 로그인한 사용자 + 프로필 목록. 없거나 만료면 null. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: { include: { profiles: { orderBy: { createdAt: "asc" } } } } },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
}

/** 활성 프로필 — 쿠키에 담긴 id 우선, 없으면 첫 프로필. */
export async function getActiveProfile(user: SessionUser): Promise<Profile | null> {
  const store = await cookies();
  const id = store.get(ACTIVE_PROFILE_COOKIE)?.value;
  return user.profiles.find((p) => p.id === id) ?? user.profiles[0] ?? null;
}

export async function setActiveProfile(profileId: string): Promise<void> {
  const store = await cookies();
  store.set(ACTIVE_PROFILE_COOKIE, profileId, { ...cookieOptions, httpOnly: false });
}

/**
 * 로그인 처리 — 세션 발급 + 활성 프로필 쿠키 초기화(T0.3).
 * `preferredType` 이 있으면 그 유형 프로필을, 없으면 첫 프로필을 활성으로 잡는다.
 * 프로필이 하나도 없으면(온보딩 전) 활성 프로필 쿠키를 건드리지 않는다.
 */
export async function loginUser(user: SessionUser, preferredType?: ProfileType): Promise<string> {
  const token = await createSession(user.id);
  const profile =
    (preferredType && user.profiles.find((p) => p.type === preferredType)) ?? user.profiles[0];
  if (profile) await setActiveProfile(profile.id);
  return token;
}

export type { Profile, ProfileType, User };
