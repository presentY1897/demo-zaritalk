/**
 * `GET /api/landlord/messages` — 내 발송 이력 (T1.7).
 *
 * "내" 의 기준은 **발송한 사람**이 아니라 **계약이 걸린 건물의 소유자**다(`listLandlordMessages`).
 * 크론이 만든 만기 알림(T1.4)도 같은 이력에 함께 보인다.
 */
import { requireLandlord } from "@/features/landlord/ownership";
import { requireOwnedLease } from "@/features/lease/ownership";
import { listLandlordMessages } from "@/features/notice/queries";
import { messagesQuerySchema } from "@/features/notice/schema";
import { ok, parseQuery } from "@/lib/api/response";

export async function GET(request: Request): Promise<Response> {
  const landlord = await requireLandlord();
  if (landlord.response) return landlord.response;

  const parsed = parseQuery(request, messagesQuerySchema);
  if (parsed.response) return parsed.response;
  const { leaseId, limit } = parsed.data;

  // leaseId 필터가 있으면 그 계약이 내 것인지 먼저 본다 — 남의 계약 id 를 넣어 존재 여부를
  // 떠보는 걸 막는다(없으면 404, 남의 것이면 403).
  if (leaseId) {
    const owned = await requireOwnedLease(landlord.data, leaseId);
    if (owned.response) return owned.response;
  }

  const messages = await listLandlordMessages(landlord.data.profile.id, { leaseId, limit });
  return ok({ messages });
}
