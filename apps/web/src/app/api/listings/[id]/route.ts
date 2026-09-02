/**
 * `GET·PATCH·DELETE /api/listings/[id]` — 매물 상세(T3.3) · 수정·상태 변경·삭제 (T3.1).
 *
 * ## `GET` 은 **비로그인 공개**다 (T3.3 이 넓혔다)
 *
 * T3.1 때는 이 `GET` 도 소유 임대인·수락 중개인만 읽을 수 있었다. T3.3 의 `/listings/[id]`
 * 는 **검색 유입을 받는 공개 상세 화면**이라(문서의 robots 절) 같은 리소스를 공개로 넓혔다.
 * 응답은 `PublicListingDto` 하나뿐이고 **등록자 이름·연락처는 담기지 않는다**
 * (`features/listing/public.ts` 주석 — 무엇을 담고 무엇을 빼는지의 단일 출처).
 *
 * 없는 id 는 404, 그 밖에는 200 이다. **예약·종료 매물도 404 로 감추지 않는다** —
 * 이미 공유된 링크가 갑자기 404 가 되면 안 되고, 화면이 상태 배너 + `noindex` 로 처리한다.
 *
 * `PATCH`·`DELETE` 의 권한은 그대로다(`requireListingActorForListing`) —
 * **소유 임대인 또는 수락 중개인**.
 * 다만 **삭제는 임대인만** 한다: 중개인이 임대인의 매물 이력을 지울 수 있으면 안 되고,
 * 중개인이 매물을 내리는 정상 경로는 `status: "CLOSED"` 다.
 *
 * ## 상태 전이 (`features/listing/status.ts` 가 단일 출처)
 * `OPEN ↔ RESERVED`, 둘 다 → `CLOSED`. **`CLOSED` 는 되돌릴 수 없다.**
 * `RESERVED → OPEN` 은 호실이 공실일 때만 — 예약 사이 계약이 잡혔으면 다시 공개하지 않는다.
 * 어긋나면 409 `CONFLICT`.
 *
 * `DELETE` 를 둔 이유: T1.1 의 호실 삭제가 "등록된 매물이 있으면 409 — 매물을 먼저 내려 달라"
 * 라고 안내하는데, 매물을 지울 길이 없으면 그 안내를 따를 수 없다.
 */
import { prisma } from "@zari/db";
import { resolveCommuteWorkplace } from "@/features/listing/commute";
import { requireListingActorForListing } from "@/features/listing/permissions";
import { getPublicListing } from "@/features/listing/public";
import { getListing, getUnitStatus, isOccupied } from "@/features/listing/queries";
import { updateListingSchema } from "@/features/listing/schema";
import { checkStatusTransition } from "@/features/listing/status";
import { listingDetailQuerySchema } from "@/features/search/schema";
import { fail, noContent, ok, parseJson, parseQuery } from "@/lib/api/response";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;

  const parsed = parseQuery(request, listingDetailQuerySchema);
  if (parsed.response) return parsed.response;

  // 세션을 요구하지 않는다 — 있으면 통근 배지(T3.5 자리)에만 쓴다
  const commuteWorkplace = await resolveCommuteWorkplace(parsed.data.workplaceId);

  const listing = await getPublicListing(id, { commuteWorkplace });
  if (!listing) return fail("NOT_FOUND", "매물을 찾을 수 없습니다.");
  return ok({ listing });
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;
  const actor = await requireListingActorForListing(id);
  if (actor.response) return actor.response;

  const parsed = await parseJson(request, updateListingSchema);
  if (parsed.response) return parsed.response;
  const input = parsed.data;
  const current = actor.data.listing;

  // 거래유형·월세는 저장된 값과 합친 뒤 정합성을 본다(둘 중 하나만 보내도 막히게)
  const dealType = input.dealType ?? current.dealType;
  const monthlyRent = input.monthlyRent ?? current.monthlyRent;
  if (dealType === "JEONSE" && monthlyRent !== 0) {
    return fail("VALIDATION_ERROR", "전세는 월세가 0원이어야 합니다.");
  }
  if (dealType === "WOLSE" && monthlyRent <= 0) {
    return fail("VALIDATION_ERROR", "월세 금액을 입력해 주세요.");
  }

  if (input.status !== undefined) {
    const unitStatus = await getUnitStatus(current.unitId);
    const transition = checkStatusTransition({
      from: current.status,
      to: input.status,
      unitOccupied: isOccupied(unitStatus),
    });
    if (!transition.ok) return fail("CONFLICT", transition.reason);
  } else if (current.status === "CLOSED") {
    // 종료한 매물의 조건을 고쳐 봐야 아무 데도 노출되지 않는다 — 착각을 막으려 막는다
    return fail("CONFLICT", "종료한 매물은 수정할 수 없습니다. 새로 등록해 주세요.");
  }

  await prisma.listing.update({
    where: { id },
    data: {
      ...(input.dealType === undefined ? {} : { dealType: input.dealType }),
      ...(input.deposit === undefined ? {} : { deposit: input.deposit }),
      ...(input.monthlyRent === undefined ? {} : { monthlyRent: input.monthlyRent }),
      // 빈 문자열이면 지운다(null 저장) — T1.1 PATCH 규약과 같다
      ...(input.description === undefined ? {} : { description: input.description || null }),
      ...(input.photos === undefined ? {} : { photos: input.photos }),
      ...(input.availableFrom === undefined
        ? {}
        : {
            availableFrom: input.availableFrom
              ? new Date(`${input.availableFrom}T00:00:00Z`)
              : null,
          }),
      ...(input.status === undefined ? {} : { status: input.status }),
    },
  });

  const listing = await getListing(id);
  if (!listing) return fail("NOT_FOUND", "매물을 찾을 수 없습니다.");
  return ok({ listing });
}

export async function DELETE(_request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;
  const actor = await requireListingActorForListing(id);
  if (actor.response) return actor.response;

  if (actor.data.role !== "LANDLORD") {
    return fail("FORBIDDEN", "매물 삭제는 임대인만 할 수 있습니다. 매물을 종료해 주세요.");
  }

  await prisma.listing.delete({ where: { id } });
  return noContent();
}
