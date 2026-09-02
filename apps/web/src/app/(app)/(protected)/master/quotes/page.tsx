import type { Metadata } from "next";
import { MasterOnly } from "@/features/master/MasterOnly";
import { MasterQuotesView } from "@/features/master/MasterQuotesView";
import { requireMaster } from "@/features/master/ownership";
import { listMasterQuotes } from "@/features/workorder/quotes";

/**
 * `/master/quotes` — 마스터 「내 견적」 (T5.3). T0.5 가 배정한 탭 목적지의 플레이스홀더를 대체한다.
 *
 * 읽기 전용 화면이라 **API 라우트를 따로 두지 않았다** — 견적을 만드는 자리는
 * `/master/orders/[id]`(`POST /api/work-orders/[id]/quotes`) 이고, 이 목록은 그 뒤에
 * 서버가 다시 그리면 충분하다. 조회 함수는 임대인 쪽 견적 카드와 같은 파일
 * (`features/workorder/quotes.ts`)에 있어 `source`(push/pull) 판정이 갈리지 않는다.
 */
export const metadata: Metadata = { title: "내 견적 — 자리 데모" };

export default async function MasterQuotesPage() {
  const master = await requireMaster();
  // 화면은 API 처럼 403 을 던질 수 없으므로 안내 화면으로 바꿔 준다
  if (master.response) return <MasterOnly />;

  const quotes = await listMasterQuotes(master.data.profile.id);
  return <MasterQuotesView quotes={quotes} />;
}
