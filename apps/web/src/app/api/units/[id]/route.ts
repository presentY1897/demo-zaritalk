/**
 * `GET·PATCH·DELETE /api/units/[id]` — 호실 상세·수정·삭제 (T1.1).
 *
 * 상세에는 **계약(현재·과거)·매물·수납 요약**이 함께 담긴다(`getUnitDetail`).
 * 수납 요약은 저장된 청구 컬럼의 단순 집계다 — 원장 계산은 T1.4 소유.
 *
 * `DELETE` 는 task 표에는 없지만 완료 기준의 "등록·수정·삭제 완주" 때문에 넣었다.
 * 계약·매물·중개 요청이 걸린 호실은 **409**(`blockingReason`).
 */
import { prisma } from "@zari/db";
import { requireLandlord, requireOwnedUnit } from "@/features/landlord/ownership";
import { blockingReason, countUnitBlockers, getUnitDetail } from "@/features/landlord/queries";
import { updateUnitSchema } from "@/features/landlord/schema";
import { fail, noContent, ok, parseJson } from "@/lib/api/response";

type Context = { params: Promise<{ id: string }> };

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "P2002";
}

export async function GET(_request: Request, context: Context): Promise<Response> {
  const landlord = await requireLandlord();
  if (landlord.response) return landlord.response;

  const { id } = await context.params;
  const owned = await requireOwnedUnit(landlord.data, id);
  if (owned.response) return owned.response;

  const unit = await getUnitDetail(id);
  if (!unit) return fail("NOT_FOUND", "호실을 찾을 수 없습니다.");
  return ok({ unit });
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const landlord = await requireLandlord();
  if (landlord.response) return landlord.response;

  const { id } = await context.params;
  const owned = await requireOwnedUnit(landlord.data, id);
  if (owned.response) return owned.response;

  const parsed = await parseJson(request, updateUnitSchema);
  if (parsed.response) return parsed.response;
  const input = parsed.data;

  // 라벨을 바꾸면 같은 건물 안에서 유일해야 한다(`@@unique([buildingId, label])`)
  if (input.label !== undefined && input.label !== owned.data.label) {
    const duplicate = await prisma.unit.findUnique({
      where: { buildingId_label: { buildingId: owned.data.buildingId, label: input.label } },
      select: { id: true },
    });
    if (duplicate) return fail("CONFLICT", `이미 있는 호실입니다: ${input.label}`);
  }

  try {
    await prisma.unit.update({
      where: { id },
      data: {
        ...(input.label === undefined ? {} : { label: input.label }),
        // null 을 보내면 비운다(선택 입력 필드)
        ...(input.floor === undefined ? {} : { floor: input.floor }),
        ...(input.areaM2 === undefined ? {} : { areaM2: input.areaM2 }),
        ...(input.rooms === undefined ? {} : { rooms: input.rooms }),
        ...(input.note === undefined ? {} : { note: input.note || null }),
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) return fail("CONFLICT", `이미 있는 호실입니다: ${input.label}`);
    throw error;
  }

  const unit = await getUnitDetail(id);
  if (!unit) return fail("NOT_FOUND", "호실을 찾을 수 없습니다.");
  return ok({ unit });
}

export async function DELETE(_request: Request, context: Context): Promise<Response> {
  const landlord = await requireLandlord();
  if (landlord.response) return landlord.response;

  const { id } = await context.params;
  const owned = await requireOwnedUnit(landlord.data, id);
  if (owned.response) return owned.response;

  const reason = blockingReason(await countUnitBlockers([id]), "호실");
  if (reason) return fail("CONFLICT", reason);

  await prisma.unit.delete({ where: { id } });
  return noContent();
}
