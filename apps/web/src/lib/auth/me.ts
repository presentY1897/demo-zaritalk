/**
 * `GET /api/me` 응답 조립 — 로그인 응답(`demo-login`, `otp/verify`)도 같은 모양을 쓴다.
 * 클라이언트가 로그인 직후 `/api/me` 캐시를 그대로 채울 수 있게 하기 위함이다.
 */
import { prisma, type MasterDetail, type ProfileType, type RealtorDetail } from "@zari/db";
import { getActiveProfile, type SessionUser } from "./session";

export type MeUser = {
  id: string;
  name: string;
  phone: string;
  isAdmin: boolean;
};

export type MeProfile = {
  id: string;
  type: ProfileType;
  createdAt: Date;
  /** REALTOR 프로필만 채워진다 */
  realtorDetail: RealtorDetail | null;
  /** MASTER 프로필만 채워진다 */
  masterDetail: MasterDetail | null;
};

export type MeResponse = {
  user: MeUser;
  profiles: MeProfile[];
  /** 프로필이 하나도 없으면 null (온보딩 전 상태) */
  activeProfile: MeProfile | null;
};

/** 로그인한 User + 프로필 목록(중개인·마스터 Detail 포함) + 활성 프로필. */
export async function buildMeResponse(user: SessionUser): Promise<MeResponse> {
  const profiles = await prisma.profile.findMany({
    where: { userId: user.id },
    include: { realtorDetail: true, masterDetail: true },
    orderBy: { createdAt: "asc" },
  });

  const active = await getActiveProfile(user);
  const mapped: MeProfile[] = profiles.map((p) => ({
    id: p.id,
    type: p.type,
    createdAt: p.createdAt,
    realtorDetail: p.realtorDetail,
    masterDetail: p.masterDetail,
  }));

  return {
    user: { id: user.id, name: user.name, phone: user.phone, isAdmin: user.isAdmin },
    profiles: mapped,
    activeProfile: mapped.find((p) => p.id === active?.id) ?? null,
  };
}
