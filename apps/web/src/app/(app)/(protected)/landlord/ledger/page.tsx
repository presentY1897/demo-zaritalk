import type { Metadata } from "next";
import { LandlordOnly } from "@/features/landlord/LandlordOnly";
import { findLandlordProfile } from "@/features/landlord/ownership";
import { LedgerView } from "@/features/ledger/LedgerView";
import { currentLedgerYear, getLedgerYear } from "@/features/ledger/queries";
import { parseYearParam } from "@/features/ledger/schema";
import { requireUser } from "@/features/shell/session";

/**
 * `/landlord/ledger` — 임대장부 (T1.6).
 *
 * **진입 경로**: 임대인 탭바의 "자산"(`/landlord/buildings`) 헤더에 있는 「장부」 버튼.
 * T0.5 탭 배정표에는 장부 탭이 없고 탭 구성은 T0.5 소유라 늘리지 않았다 —
 * 대신 같은 임대인 자산 흐름 안에 링크를 뒀다. T1.9 임대인 홈이 붙으면
 * 홈 대시보드의 "이번 달 수납" 카드에서도 이 경로로 들어오게 하는 것이 최종 자리다.
 *
 * Next 16 에서 `searchParams` 는 **Promise** 다
 * (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`).
 * 딥링크(`?year=2026&buildingId=…`)는 여기서만 읽는다 — 화면 안에서 필터를 바꿀 때는
 * URL 을 갱신하지 않는다(서버 컴포넌트가 다시 돌아 같은 데이터를 두 번 받게 된다).
 * 잘못된 `year` 는 400 대신 **올해로 조용히 되돌린다** — 화면은 링크를 타고 들어온
 * 사용자에게 에러를 던지기보다 기본값을 보여 주는 편이 낫다(API 는 400 을 준다).
 */
export const metadata: Metadata = { title: "임대장부 — 자리 데모" };

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string | string[]; buildingId?: string | string[] }>;
}) {
  const user = await requireUser();
  const profile = findLandlordProfile(user);
  if (!profile) return <LandlordOnly />;

  const params = await searchParams;
  const year = parseYearParam(params.year) ?? currentLedgerYear();
  const requestedBuildingId = typeof params.buildingId === "string" ? params.buildingId : null;

  // 남의 건물 id 를 붙여 와도 소유자 조건이 걸린 조회라 빈 결과가 나온다.
  // 그래도 필터 칩이 "선택됨"으로 남지 않게, 내 건물이 아니면 전체로 되돌린다.
  const ledger = await getLedgerYear(profile.id, year, requestedBuildingId);
  const safe =
    requestedBuildingId && !ledger.buildings.some((b) => b.id === requestedBuildingId)
      ? await getLedgerYear(profile.id, year, null)
      : ledger;

  return <LedgerView initialLedger={safe} />;
}
