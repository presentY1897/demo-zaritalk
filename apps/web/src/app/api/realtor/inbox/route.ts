/**
 * `GET /api/realtor/inbox` — 중개인 수신함 (T3.7).
 *
 * 나에게 발송된 `BrokerageTarget` 을 **최신 요청순**으로 준다. 거리는 지금 다시 계산하지 않고
 * **발송 시점에 굳은 `BrokerageTarget.distanceKm`** 를 그대로 쓴다 — 사무소를 옮겨도
 * "그때 이 거리라서 받았다" 가 남아야 한다(T5.2 추천함과 같은 규칙).
 *
 * 카드에는 **수락 뒤에만** 임대인 연락처가 담긴다. 수락이 곧 "연락해도 된다" 는 합의다.
 *
 * | 실패 | status · code |
 * |---|---|
 * | 비로그인 | 401 `UNAUTHORIZED` |
 * | 중개인 프로필 없음 | 403 `FORBIDDEN` |
 * | 사무소 위치·활동반경 미등록 | 403 `FORBIDDEN` |
 */
import { requireRealtor } from "@/features/brokerage/ownership";
import { listRealtorInbox, toRealtorProfileDto } from "@/features/brokerage/queries";
import { ok } from "@/lib/api/response";

export async function GET(): Promise<Response> {
  const realtor = await requireRealtor();
  if (realtor.response) return realtor.response;

  const requests = await listRealtorInbox(realtor.data);
  return ok({ requests, realtor: toRealtorProfileDto(realtor.data.detail) });
}
