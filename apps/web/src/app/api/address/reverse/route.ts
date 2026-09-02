/**
 * `GET /api/address/reverse?lat=&lng=` — 좌표 → 주소 (카카오 `geo/coord2address`).
 *
 * 지금 화면에서 쓰는 곳은 없다. **T3.2(지도 핀 이동 → 주소 표시)** 가 곧 쓸 자리라
 * 주소 검색과 같은 프록시·정규화 규약으로 함께 열어 둔다(키가 클라이언트로 나가지 않게).
 *
 * ```
 * 200 { "address": { "address": "…", "roadAddress": "…", "lat": 37.5, "lng": 127.0 } }
 * 200 { "address": null }        // 바다·비주소 지역
 * ```
 *
 * | 실패 | status · code |
 * |---|---|
 * | 좌표 누락·숫자 아님·**대한민국 범위 밖**(위 33~39 / 경 124~132) | 400 `VALIDATION_ERROR` |
 * | 카카오 장애·키 문제 | 500 `INTERNAL_ERROR` |
 */
import { failAddressLookup } from "@/features/address/failure";
import { reverseGeocode } from "@/features/address/kakao";
import { reverseAddressQuerySchema } from "@/features/address/schema";
import { ok, parseQuery } from "@/lib/api/response";

export async function GET(request: Request): Promise<Response> {
  const parsed = parseQuery(request, reverseAddressQuerySchema);
  if (parsed.response) return parsed.response;

  const result = await reverseGeocode(parsed.data.lat, parsed.data.lng);
  if (!result.ok) return failAddressLookup(result.failure);

  return ok({ address: result.data });
}
