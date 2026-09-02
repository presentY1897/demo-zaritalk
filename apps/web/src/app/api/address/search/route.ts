/**
 * `GET /api/address/search` — 카카오 로컬 주소·장소 검색 **프록시** (T3.1·T3.4 공용).
 *
 * ## 왜 프록시인가
 * 1. **키 보호** — `KAKAO_REST_API_KEY` 는 서버에만 둔다. 화면이 카카오를 직접 부르면
 *    REST 키가 브라우저에 노출된다(카카오 JS 키와 달리 도메인 제한이 없다).
 * 2. **응답 정규화** — 카카오는 좌표를 문자열 `x`(경도)·`y`(위도)로 주고, 주소 검색과
 *    키워드 검색의 문서 모양이 다르다. 여기서 한 가지 `AddressCandidate` 로 맞춘다.
 *
 * ## 로그인을 요구하지 않는다
 * 온보딩(`/onboarding?ticket=`)의 중개인·마스터 활동지역 입력은 **세션이 생기기 전**에
 * 주소를 고른다. 여기서 401 을 내면 가입 자체가 막힌다. T3.2 의 비로그인 매물 탐색도 같다.
 * 대신 검색어 길이(2~50)·후보 수(≤15)를 스키마로 조여 두고, 응답에는 좌표·주소만 담는다.
 *
 * ```
 * GET /api/address/search?query=행당로 79&size=8
 * 200 { "candidates": [ { id, address, roadAddress, lat, lng, placeName, category, source } ],
 *       "meta": { "total": 1, "isEnd": true } }
 * ```
 *
 * | 실패 | status · code |
 * |---|---|
 * | 검색어 2자 미만·50자 초과·size 범위 밖 | 400 `VALIDATION_ERROR` |
 * | 카카오 키 없음·인증 실패·쿼터 초과·장애·타임아웃 | 500 `INTERNAL_ERROR` (사유는 문구로) |
 *
 * 결과가 없으면 **200 + 빈 배열**이다(에러가 아니다).
 */
import { failAddressLookup } from "@/features/address/failure";
import { searchAddressAndPlace } from "@/features/address/kakao";
import { addressSearchQuerySchema } from "@/features/address/schema";
import { ok, parseQuery } from "@/lib/api/response";

export async function GET(request: Request): Promise<Response> {
  const parsed = parseQuery(request, addressSearchQuerySchema);
  if (parsed.response) return parsed.response;

  const result = await searchAddressAndPlace(parsed.data.query, parsed.data.size);
  if (!result.ok) return failAddressLookup(result.failure);

  return ok(result.data);
}
