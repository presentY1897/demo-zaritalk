import type { Metadata } from "next";
import { requireUser } from "@/features/shell/session";
import { findTenantProfile } from "@/features/tenant/ownership";
import { getTenantHome } from "@/features/tenant/queries";
import { TenantHomeView } from "@/features/tenant/TenantHomeView";
import { TenantOnly } from "@/features/tenant/TenantOnly";

/**
 * `/tenant` — 세입자 탭바의 "홈"(경로는 T0.5 에서 확정) (T1.3).
 *
 * 내 계약 카드 · 이번 달 납부 상태 · 자리페이 결제(T2.2) · 환급 배너(T2.3·T2.4) · 민원 진입(T2.6).
 * 서버가 원장 엔진 기준으로 집계해(`getTenantHome`) 클라이언트 화면에 그대로 넘긴다.
 */
export const metadata: Metadata = { title: "홈 — 자리 데모" };

export default async function TenantHomePage() {
  const user = await requireUser();
  const profile = findTenantProfile(user);
  if (!profile) return <TenantOnly title="홈" />;

  const home = await getTenantHome(profile.id, user.phone);
  return <TenantHomeView home={home} />;
}
