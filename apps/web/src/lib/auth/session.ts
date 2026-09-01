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

/** 세션 발급 — DB 레코드 생성 + httpOnly 쿠키 설정. */
export async function createSession(userId: string): Promise<string> {
  const token = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({ data: { token, userId, expiresAt } });

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
    include: { user: { include: { profiles: true } } },
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

export type { Profile, ProfileType, User };
