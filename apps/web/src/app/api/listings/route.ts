/**
 * `GET·POST /api/listings` — 매물 목록(T3.2) · 등록(T3.1).
 *
 * ## `GET` — 지도 영역 + 필터 (T3.2, **비로그인 공개**)
 *
 * ```
 * ?bounds=37.5432,127.0211,37.5721,127.0512&dealType=WOLSE&depositMax=20000000&rentMax=700000&limit=100
 * ```
 *
 * - **`status = OPEN` 만** 나간다. 예약·종료 매물은 탐색에 뜨지 않는다.
 * - `bounds` 형식·검증은 `features/search/bounds.ts`, 필터 형식은 `features/search/filters.ts`
 *   한 곳에 있다. 어긋나면 400 `VALIDATION_ERROR`.
 * - `bounds` 는 **선택**이다. 없으면 영역 제한 없이 최신순으로 준다 — `/search` 첫 진입은
 *   지도가 아직 어디를 보는지 모르기 때문이다.
 * - `limit`(기본 100 · 최대 200)까지만 주고, 더 있으면 `truncated: true` 를 실어
 *   화면이 "지도를 확대해 주세요" 로 안내한다(커서 페이지네이션을 두지 않은 이유는
 *   `features/search/queries.ts` 주석).
 * - `workplaceId` 를 주면 **로그인 세입자의 자기 근무지일 때만** 통근 캐시를 붙인다(T3.5 자리).
 *   아니면 조용히 무시하고 `commuteWorkplaceId: null` 로 알린다.
 *
 * ## `POST` — 매물 등록 (T3.1)
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
import { resolveCommuteWorkplace } from "@/features/listing/commute";
import {
  findLiveListing,
  getListing,
  getUnitStatus,
  listingBlockedReason,
} from "@/features/listing/queries";
import { requireListingActorForUnit } from "@/features/listing/permissions";
import { createListingSchema } from "@/features/listing/schema";
import { searchListings } from "@/features/search/queries";
import { toSearchRequest } from "@/features/search/request";
import { listListingsQuerySchema } from "@/features/search/schema";
import { created, fail, ok, parseJson, parseQuery } from "@/lib/api/response";

export async function GET(request: Request): Promise<Response> {
  const parsed = parseQuery(request, listListingsQuerySchema);
  if (parsed.response) return parsed.response;

  const resolved = toSearchRequest(parsed.data);
  // 빈 문자열도 사유가 될 수 없으므로 `!== undefined` 로 본다(문자열은 truthy 판정이 좁혀 주지 않는다)
  if (resolved.error !== undefined) return fail("VALIDATION_ERROR", resolved.error);

  // 세션을 **요구하지 않는다** — 있으면 통근 배지에만 쓴다(비로그인 탐색이 이 화면의 목적이다)
  const commuteWorkplace = await resolveCommuteWorkplace(resolved.data.workplaceId);

  const result = await searchListings({
    bounds: resolved.data.bounds,
    filters: resolved.data.filters,
    limit: resolved.data.limit,
    commuteWorkplace,
  });
  return ok(result);
}

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
