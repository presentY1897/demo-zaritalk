/**
 * `GET·POST /api/brokerage-requests` — 임대인 중개 요청 목록·발송 (T3.6).
 *
 * ## `POST` — 저장하면 **그 자리에서 발송이 나간다**
 * 요청을 만든 직후 `dispatchBrokerageTargets` 가 **건물 좌표 기준**으로 활동반경 안의
 * 중개인을 거리순 최대 20명 골라 `BrokerageTarget(SENT)` + 알림톡 시뮬(`MessageLog`)을 만든다.
 * 대상 선정은 미리보기(`GET …/preview`)와 **같은 함수**(`selectBrokerageTargets`)를 쓰므로
 * "미리보기 3명 → 보내니 5명" 같은 어긋남이 없다.
 *
 * ## 같은 호실에 다시 보내면 **새 요청을 만들지 않는다**
 * 그 호실에 아직 `OPEN` 인 요청이 있으면 **그 요청에 재발송**한다(200 · `reused: true`).
 * 새 요청을 매번 쌓으면 임대인 목록이 같은 호실로 도배되고, 중개인은 같은 공실을 여러 번 받는다.
 * 재발송에서는 **이미 보낸 중개인을 건너뛰므로** 그 사이 새로 조건을 만족하게 된 중개인에게만 간다
 * (`@@unique([requestId, realtorProfileId])`). 요청이 `MATCHED`·`CLOSED` 면 새 요청을 만든다 —
 * 이미 한 번 매칭된 건과 새로 찾는 건은 다른 이야기다.
 *
 * 발송이 실패해도 요청 자체는 남긴다(같은 트랜잭션에 묶지 않는다) — 대상 0명도 실패가 아니다.
 *
 * | 실패 | status · code |
 * |---|---|
 * | 비로그인 | 401 `UNAUTHORIZED` |
 * | 임대인 프로필 없음 | 403 `FORBIDDEN` |
 * | 없는 호실 | 404 `NOT_FOUND` |
 * | 남의 호실 | 403 `FORBIDDEN` |
 * | **계약중·대기 호실** | 409 `CONFLICT` |
 * | 메시지 500자 초과·호실 누락 | 400 `VALIDATION_ERROR` |
 */
import { prisma } from "@zari/db";
import { requireLandlord, requireOwnedUnit } from "@/features/landlord/ownership";
import {
  brokerageBlockedReason,
  findOpenRequestForUnit,
  getBrokerageRequest,
  listBrokerageUnitOptions,
  listLandlordBrokerageRequests,
} from "@/features/brokerage/queries";
import { dispatchBrokerageTargets } from "@/features/brokerage/matching";
import { createBrokerageRequestSchema } from "@/features/brokerage/schema";
import { getUnitStatus } from "@/features/listing/queries";
import { created, fail, ok, parseJson } from "@/lib/api/response";

export async function GET(): Promise<Response> {
  const landlord = await requireLandlord();
  if (landlord.response) return landlord.response;

  const [requests, units] = await Promise.all([
    listLandlordBrokerageRequests(landlord.data.profile.id),
    listBrokerageUnitOptions(landlord.data.profile.id),
  ]);
  return ok({ requests, units });
}

export async function POST(request: Request): Promise<Response> {
  const landlord = await requireLandlord();
  if (landlord.response) return landlord.response;

  const parsed = await parseJson(request, createBrokerageRequestSchema);
  if (parsed.response) return parsed.response;
  const input = parsed.data;

  const unit = await requireOwnedUnit(landlord.data, input.unitId);
  if (unit.response) return unit.response;

  // 공실 판정은 T1.1 `deriveUnitStatus` 를 그대로 쓴다 — 자산 그리드·매물 등록과 같은 답이다
  const blocked = brokerageBlockedReason(await getUnitStatus(unit.data.id));
  if (blocked) return fail("CONFLICT", blocked);

  const open = await findOpenRequestForUnit(unit.data.id);
  const reused = open !== null;

  let requestId: string;
  if (open) {
    requestId = open.id;
    // 메시지를 새로 적어 보냈으면 갈아 끼운다(비워 보냈으면 기존 문구를 지우지 않는다)
    if (input.message !== null && input.message !== open.message) {
      await prisma.brokerageRequest.update({
        where: { id: open.id },
        data: { message: input.message },
      });
    }
  } else {
    const row = await prisma.brokerageRequest.create({
      data: {
        unitId: unit.data.id,
        landlordProfileId: landlord.data.profile.id,
        message: input.message,
        // status 는 스키마 기본값 OPEN — 첫 수락에서 MATCHED 로 넘어간다
      },
    });
    requestId = row.id;
  }

  const dispatchedCount = await dispatchBrokerageTargets(requestId);

  const brokerageRequest = await getBrokerageRequest(requestId);
  if (!brokerageRequest) return fail("INTERNAL_ERROR", "중개 요청을 저장하지 못했습니다.");

  const body = { request: brokerageRequest, dispatchedCount, reused };
  return reused ? ok(body) : created(body);
}
