/**
 * `POST /api/listings` — 매물 등록 (T3.1).
 * (`GET` 은 호실 화면이 `GET /api/listings/[id]` 또는 페이지 초기 데이터로 읽으므로 두지 않았다.
 *  `/search` 목록 조회는 T3.2 소유다.)
 *
 * task 표에는 `POST·PATCH /api/listings` 로 적혀 있지만, 수정은 대상이 하나로 정해져야 하므로
 * **`PATCH /api/listings/[id]`** 로 나눴다(D1 규약의 나머지 리소스와 같은 모양).
 *
 * ## 권한 — 소유 임대인 또는 수락 중개인
 * `features/listing/permissions.ts` 한 곳에서 판정한다. 중개인 경로는 T3.7(수신함·수락)이
 * `BrokerageTarget.status = ACCEPTED` 를 만들어 주면 코드 변경 없이 열린다.
 *
 * ## 등록을 막는 두 가지
 * | 상황 | status · code |
 * |---|---|
 * | **계약중·대기 호실**(진행 중 계약 있음) | 409 `CONFLICT` |
 * | 이미 살아 있는 매물(OPEN·RESERVED)이 있음 | 409 `CONFLICT` |
 *
 * 그 밖에 401(비로그인) · 404(없는 호실) · 403(남의 호실·수락 안 한 중개인) ·
 * 400(금액·날짜·사진 URL 형식, 전세인데 월세 > 0 등).
 */
import { prisma } from "@zari/db";
import {
  findLiveListing,
  getListing,
  getUnitStatus,
  listingBlockedReason,
} from "@/features/listing/queries";
import { requireListingActorForUnit } from "@/features/listing/permissions";
import { createListingSchema } from "@/features/listing/schema";
import { created, fail, parseJson } from "@/lib/api/response";

export async function POST(request: Request): Promise<Response> {
  const parsed = await parseJson(request, createListingSchema);
  if (parsed.response) return parsed.response;
  const input = parsed.data;

  const actor = await requireListingActorForUnit(input.unitId);
  if (actor.response) return actor.response;

  const [status, live] = await Promise.all([
    getUnitStatus(input.unitId),
    findLiveListing(input.unitId),
  ]);
  const blocked = listingBlockedReason(status, live);
  if (blocked) return fail("CONFLICT", blocked);

  const row = await prisma.listing.create({
    data: {
      unitId: input.unitId,
      listedByProfileId: actor.data.profile.id,
      dealType: input.dealType,
      deposit: input.deposit,
      monthlyRent: input.monthlyRent,
      description: input.description?.trim() || null,
      photos: input.photos && input.photos.length > 0 ? input.photos : undefined,
      availableFrom: input.availableFrom ? new Date(`${input.availableFrom}T00:00:00Z`) : null,
      // 등록은 언제나 공개(OPEN)로 시작한다 — 예약·종료는 상태 변경(PATCH)으로만
      status: "OPEN",
    },
  });

  const listing = await getListing(row.id);
  if (!listing) return fail("INTERNAL_ERROR", "매물을 저장하지 못했습니다.");
  return created({ listing });
}
