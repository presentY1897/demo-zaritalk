import type { Metadata } from "next";
import { Suspense } from "react";
import { LandlordHomeSkeleton } from "@/features/dashboard/LandlordHomeSkeleton";
import { LandlordHomeView } from "@/features/dashboard/LandlordHomeView";
import { NoLandlordProfile } from "@/features/dashboard/NoLandlordProfile";
import { getLandlordSummary } from "@/features/dashboard/queries";
import { findLandlordProfile } from "@/features/landlord/ownership";
import { requireUser } from "@/features/shell/session";

/**
 * `/landlord` — 임대인 탭바의 "홈"(경로는 T0.5 에서 확정) (T1.9).
 *
 * 이번 달 수납 현황 · 연체 리스트 · 만기 3개월 이내 · 미확인 민원/견적 배지.
 * 서버 컴포넌트가 집계를 읽어 클라이언트 화면에 `initialData` 로 넘긴다 —
 * `GET /api/landlord/summary` 와 **같은 함수**(`getLandlordSummary`)라 모양이 어긋나지 않는다.
 *
 * 집계 조회만 `<Suspense>` 안에 두어 로딩 중에도 셸·탭바가 먼저 그려지게 한다
 * (`loading.tsx` 는 `/landlord/**` 하위 라우트 전체에 걸리므로 쓰지 않는다).
 */
export const metadata: Metadata = { title: "홈 — 자리 데모" };

export default async function LandlordHomePage() {
  const user = await requireUser();
  const profile = findLandlordProfile(user);
  if (!profile) return <NoLandlordProfile />;

  return (
    <Suspense fallback={<LandlordHomeSkeleton />}>
      <LandlordHomeSection ownerProfileId={profile.id} />
    </Suspense>
  );
}

async function LandlordHomeSection({ ownerProfileId }: { ownerProfileId: string }) {
  const summary = await getLandlordSummary(ownerProfileId);
  return <LandlordHomeView initialSummary={summary} />;
}
