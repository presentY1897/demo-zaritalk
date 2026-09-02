/**
 * 좌표 검증 단일 출처 (T3.1·T3.4).
 *
 * 대한민국 범위(위도 33~39 / 경도 124~132)를 벗어난 좌표는 받지 않는다. 카카오 로컬 API 가
 * 돌려주는 좌표는 언제나 이 안에 들지만, **사용자가 보낸 본문을 그대로 믿지 않기 위해**
 * 서버 스키마에서 한 번 더 막는다(주소 검색을 거치지 않고 API 를 직접 부를 수 있으므로).
 *
 * 같은 범위를 T0.4(`features/profiles/schema.ts`)·T1.1(`features/landlord/schema.ts`)이
 * 각자 적어 두고 있었다 — 주소 검색을 넣으면서 두 곳 모두 이 모듈을 import 하도록 바꿨다.
 * **`@zari/db` 를 import 하지 않는다** — 클라이언트 폼도 같은 스키마로 미리 막는다.
 */
import { z } from "zod";

/** 대한민국 위도 범위 */
export const KOREA_LAT_MIN = 33;
export const KOREA_LAT_MAX = 39;
/** 대한민국 경도 범위 */
export const KOREA_LNG_MIN = 124;
export const KOREA_LNG_MAX = 132;

const LAT_MESSAGE = `위도는 ${KOREA_LAT_MIN}~${KOREA_LAT_MAX} 사이(대한민국)여야 합니다.`;
const LNG_MESSAGE = `경도는 ${KOREA_LNG_MIN}~${KOREA_LNG_MAX} 사이(대한민국)여야 합니다.`;

export const latSchema = z.number().min(KOREA_LAT_MIN, LAT_MESSAGE).max(KOREA_LAT_MAX, LAT_MESSAGE);
export const lngSchema = z.number().min(KOREA_LNG_MIN, LNG_MESSAGE).max(KOREA_LNG_MAX, LNG_MESSAGE);

/** 쿼리스트링(문자열)로 좌표를 받는 곳(`GET /api/address/reverse`)용 */
export const latQuerySchema = z.coerce.number().pipe(latSchema);
export const lngQuerySchema = z.coerce.number().pipe(lngSchema);

/** 한국 범위 안인가 — 외부 API 응답을 걸러낼 때 쓴다(스키마 대신 boolean 이 필요한 자리) */
export function isWithinKorea(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= KOREA_LAT_MIN &&
    lat <= KOREA_LAT_MAX &&
    lng >= KOREA_LNG_MIN &&
    lng <= KOREA_LNG_MAX
  );
}
