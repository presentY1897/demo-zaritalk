/**
 * `GET /api/landlord/summary` — 임대인 홈 대시보드 집계 (T1.9).
 *
 * 소유권 판정은 `features/landlord/ownership.ts`(T1.1, Phase 1 공용)가 하고,
 * 집계는 서버 컴포넌트(`/landlord`)가 쓰는 것과 **같은 함수**(`getLandlordSummary`)로 만든다.
 *
 * | 상황 | status · code |
 * |---|---|
 * | 비로그인·만료 세션 | 401 `UNAUTHORIZED` |
 * | 로그인했지만 임대인 프로필 없음 | 403 `FORBIDDEN` |
 *
 * 남의 데이터는 애초에 조회 조건(`ownerProfileId`)에서 걸러지므로 따로 판정할 대상이 없다.
 */
import { getLandlordSummary } from "@/features/dashboard/queries";
import { requireLandlord } from "@/features/landlord/ownership";
import { ok } from "@/lib/api/response";

export async function GET(): Promise<Response> {
  const landlord = await requireLandlord();
  if (landlord.response) return landlord.response;

  const summary = await getLandlordSummary(landlord.data.profile.id);
  return ok({ summary });
}
