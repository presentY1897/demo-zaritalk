import type { Metadata } from "next";
import { requireRealtor } from "@/features/brokerage/ownership";
import { listRealtorInbox, toRealtorProfileDto } from "@/features/brokerage/queries";
import { RealtorInboxView } from "@/features/realtor/RealtorInboxView";
import { RealtorOnly } from "@/features/realtor/RealtorOnly";

/**
 * `/realtor` — 중개인 홈(수신함) (T3.7). T0.5 가 배정한 탭 목적지의 플레이스홀더를 대체한다.
 *
 * 라우트 핸들러(`GET /api/realtor/inbox`)와 **같은 조회 함수**로 첫 데이터를 그린다.
 * **여기서는 열람(`VIEWED`)을 찍지 않는다** — 목록을 스쳐 본 것과 요청을 열어 본 것은 다르고,
 * 임대인이 보는 「열람 n」 은 후자여야 한다. 열람은 상세 화면이 표시한다.
 */
export const metadata: Metadata = { title: "중개 요청 — 자리 데모" };

export default async function RealtorInboxPage() {
  const realtor = await requireRealtor();
  if (realtor.response) return <RealtorOnly />;

  const requests = await listRealtorInbox(realtor.data);
  return (
    <RealtorInboxView
      initialData={{ requests, realtor: toRealtorProfileDto(realtor.data.detail) }}
    />
  );
}
