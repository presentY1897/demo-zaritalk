/**
 * `GET /api/brokerage-requests/preview?unitId=` — **발송 전 대상 미리보기** (T3.6).
 *
 * **아무 것도 쓰지 않는다.** 실제 발송(`POST /api/brokerage-requests`)이 부르는 것과
 * **같은 함수**(`selectBrokerageTargets`)로 대상을 고르므로 여기 뜬 인원 수가 곧 보내질 인원 수다
 * (T5.2 가 `selectWorkOrderTargets` 로 잡아 둔 패턴과 같다).
 *
 * 응답에는 **사무소 이름·주소·좌표·거리까지만** 담는다 — 보내기도 전에 반경 안 중개인의
 * 이름·전화번호가 임대인 화면에 떨어지면 그건 매칭이 아니라 명부 유출이다.
 * 연락처는 수락한 중개인에 한해 `GET /api/brokerage-requests` 의 `accepted` 로 열린다.
 *
 * | 실패 | status · code |
 * |---|---|
 * | 비로그인 | 401 `UNAUTHORIZED` |
 * | 임대인 프로필 없음 | 403 `FORBIDDEN` |
 * | 없는 호실 | 404 `NOT_FOUND` |
 * | 남의 호실 | 403 `FORBIDDEN` |
 * | `unitId` 누락 | 400 `VALIDATION_ERROR` |
 *
 * **계약중 호실은 400·409 가 아니라 200 + `blockedReason`** 이다 — 화면이 "왜 못 보내는지" 를
 * 그려야 하고, 그 안내에도 호실 정보가 필요하다(T5.2 의 `upgradeRequired` 와 같은 판단).
 */
import { requireLandlord, requireOwnedUnit } from "@/features/landlord/ownership";
import { getBrokeragePreview } from "@/features/brokerage/queries";
import { brokeragePreviewQuerySchema } from "@/features/brokerage/schema";
import { ok, parseQuery } from "@/lib/api/response";

export async function GET(request: Request): Promise<Response> {
  const landlord = await requireLandlord();
  if (landlord.response) return landlord.response;

  const parsed = parseQuery(request, brokeragePreviewQuerySchema);
  if (parsed.response) return parsed.response;

  const unit = await requireOwnedUnit(landlord.data, parsed.data.unitId);
  if (unit.response) return unit.response;

  return ok(await getBrokeragePreview(unit.data));
}
