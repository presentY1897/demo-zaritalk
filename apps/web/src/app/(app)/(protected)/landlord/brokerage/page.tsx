import type { Metadata } from "next";
import { BrokerageRequestListView } from "@/features/brokerage/BrokerageRequestListView";
import {
  listBrokerageUnitOptions,
  listLandlordBrokerageRequests,
} from "@/features/brokerage/queries";
import { LandlordOnly } from "@/features/landlord/LandlordOnly";
import { requireLandlord } from "@/features/landlord/ownership";

/**
 * `/landlord/brokerage` — 임대인 중개 요청 (T3.6). T0.5 가 배정한 탭 목적지의 플레이스홀더를 대체한다.
 *
 * 라우트 핸들러(`GET /api/brokerage-requests`)와 **같은 조회 함수**로 첫 데이터를 그린다 —
 * 화면이 내려받는 초기 데이터와 API 응답 모양이 어긋나지 않는다(T1.1 규칙).
 *
 * 호실 상세(T1.1)의 「중개 요청」 버튼이 `?unitId=` 를 달고 들어오면 그 호실을 고른 채 시트가 열린다.
 * `searchParams` 는 Next 16 규약대로 Promise 다.
 */
export const metadata: Metadata = { title: "중개요청 — 자리 데모" };

export default async function LandlordBrokeragePage({
  searchParams,
}: {
  searchParams: Promise<{ unitId?: string | string[] }>;
}) {
  const landlord = await requireLandlord();
  // 화면은 API 처럼 403 을 던질 수 없으므로 안내 화면으로 바꿔 준다
  if (landlord.response) return <LandlordOnly />;

  const [requests, units] = await Promise.all([
    listLandlordBrokerageRequests(landlord.data.profile.id),
    listBrokerageUnitOptions(landlord.data.profile.id),
  ]);

  const raw = (await searchParams).unitId;
  const requested = Array.isArray(raw) ? raw[0] : raw;
  // 남의 호실 id 를 붙여 들어와도 목록에 없으면 무시한다
  const initialUnitId = units.some((unit) => unit.unitId === requested) ? requested : null;

  return (
    <BrokerageRequestListView
      initialData={{ requests, units }}
      initialUnitId={initialUnitId ?? null}
    />
  );
}
