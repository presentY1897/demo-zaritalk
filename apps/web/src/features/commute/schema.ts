/**
 * `POST /api/commute` 요청 스키마 (T3.5).
 *
 * 본문에 **좌표는 없다.** 출발지는 호실이 붙은 건물(`Unit.building.lat/lng`)에서,
 * 도착지는 근무지(`Workplace.lat/lng`)에서 서버가 직접 읽는다 — 클라이언트가 좌표를 보내면
 * 남의 근무지 좌표로 계산을 시켜 캐시를 오염시킬 수 있고, 캐시 키(`unitId`·`workplaceId`)와
 * 실제로 계산한 지점이 어긋날 수 있다.
 *
 * **강제 갱신 파라미터를 두지 않았다.** TTL 을 우회할 수 있으면 캐시가 쿼터를 지켜 주지 못한다
 * (근거는 `cache.ts` 주석).
 *
 * `@zari/db` 를 import 하지 않는다 — 화면(`api.ts`)도 같은 타입을 쓴다.
 */
import { z } from "zod";

/** cuid 하나 — 길이만 본다(형식은 DB 조회가 판정한다: 없으면 404) */
const idSchema = z.string().trim().min(1, "id 가 비어 있습니다.").max(64, "id 가 너무 깁니다.");

export const commuteLookupSchema = z.object({
  /** 매물이 붙은 호실 id — 캐시 키의 한쪽. 매물 상세의 `listing.unitId` 를 그대로 보낸다 */
  unitId: idSchema,
  /** 내 근무지 id — 남의 것이면 403 */
  workplaceId: idSchema,
});
export type CommuteLookupSchemaInput = z.infer<typeof commuteLookupSchema>;
