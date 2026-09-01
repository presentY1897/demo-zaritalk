/**
 * `GET·PATCH·DELETE /api/buildings/[id]` — 건물 상세·수정·삭제 (T1.1).
 *
 * `GET` 은 task 표에 없지만 건물 상세 화면(호실 그리드)이 호실 추가 후 다시 읽어야 해서 넣었다.
 * 삭제 규칙은 `features/landlord/queries.ts` 의 `countUnitBlockers`·`blockingReason` 참고 —
 * 계약·매물·중개 요청이 걸린 건물은 **409** 로 막는다.
 *
 * Next 16 에서 동적 세그먼트 `params` 는 **Promise** 다(`node_modules/next/dist/docs/
 * 01-app/03-api-reference/03-file-conventions/route.md`).
 */
import { prisma } from "@zari/db";
import {
  blockingReason,
  countUnitBlockers,
  getBuildingDetail,
  getBuildingSummary,
} from "@/features/landlord/queries";
import { requireLandlord, requireOwnedBuilding } from "@/features/landlord/ownership";
import { updateBuildingSchema } from "@/features/landlord/schema";
import { fail, noContent, ok, parseJson } from "@/lib/api/response";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context): Promise<Response> {
  const landlord = await requireLandlord();
  if (landlord.response) return landlord.response;

  const { id } = await context.params;
  const owned = await requireOwnedBuilding(landlord.data, id);
  if (owned.response) return owned.response;

  const building = await getBuildingDetail(id);
  if (!building) return fail("NOT_FOUND", "건물을 찾을 수 없습니다.");
  return ok({ building });
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const landlord = await requireLandlord();
  if (landlord.response) return landlord.response;

  const { id } = await context.params;
  const owned = await requireOwnedBuilding(landlord.data, id);
  if (owned.response) return owned.response;

  const parsed = await parseJson(request, updateBuildingSchema);
  if (parsed.response) return parsed.response;
  const input = parsed.data;

  await prisma.building.update({
    where: { id },
    data: {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.address === undefined ? {} : { address: input.address }),
      // 빈 문자열로 보내면 지운다(선택 입력 필드)
      ...(input.roadAddress === undefined ? {} : { roadAddress: input.roadAddress || null }),
      ...(input.lat === undefined ? {} : { lat: input.lat }),
      ...(input.lng === undefined ? {} : { lng: input.lng }),
      ...(input.note === undefined ? {} : { note: input.note || null }),
    },
  });

  const building = await getBuildingSummary(id);
  if (!building) return fail("NOT_FOUND", "건물을 찾을 수 없습니다.");
  return ok({ building });
}

export async function DELETE(_request: Request, context: Context): Promise<Response> {
  const landlord = await requireLandlord();
  if (landlord.response) return landlord.response;

  const { id } = await context.params;
  const owned = await requireOwnedBuilding(landlord.data, id);
  if (owned.response) return owned.response;

  const units = await prisma.unit.findMany({ where: { buildingId: id }, select: { id: true } });
  const reason = blockingReason(
    await countUnitBlockers(units.map((unit) => unit.id)),
    "건물",
  );
  if (reason) return fail("CONFLICT", reason);

  // 호실은 `Unit.building` 이 onDelete: Cascade 라 함께 지워진다
  await prisma.building.delete({ where: { id } });
  return noContent();
}
