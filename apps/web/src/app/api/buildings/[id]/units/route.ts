/**
 * `POST /api/buildings/[id]/units` — 호실 추가 (T1.1).
 *
 * 호실 라벨은 건물 안에서 유일하다(`@@unique([buildingId, label])`) — 중복이면 **409**.
 * 미리 조회해서 막고, 동시 요청으로 빠져나간 경우를 대비해 Prisma 유니크 위반(P2002)도 같은
 * 409 로 바꾼다.
 */
import { prisma } from "@zari/db";
import { requireLandlord, requireOwnedBuilding } from "@/features/landlord/ownership";
import { toUnitSummary } from "@/features/landlord/queries";
import { createUnitSchema } from "@/features/landlord/schema";
import { created, fail, parseJson } from "@/lib/api/response";

type Context = { params: Promise<{ id: string }> };

/** Prisma 유니크 제약 위반 */
function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "P2002";
}

export async function POST(request: Request, context: Context): Promise<Response> {
  const landlord = await requireLandlord();
  if (landlord.response) return landlord.response;

  const { id } = await context.params;
  const owned = await requireOwnedBuilding(landlord.data, id);
  if (owned.response) return owned.response;

  const parsed = await parseJson(request, createUnitSchema);
  if (parsed.response) return parsed.response;
  const input = parsed.data;

  const duplicate = await prisma.unit.findUnique({
    where: { buildingId_label: { buildingId: id, label: input.label } },
    select: { id: true },
  });
  if (duplicate) return fail("CONFLICT", `이미 있는 호실입니다: ${input.label}`);

  try {
    const row = await prisma.unit.create({
      data: {
        buildingId: id,
        label: input.label,
        floor: input.floor ?? null,
        areaM2: input.areaM2 ?? null,
        rooms: input.rooms ?? null,
        note: input.note ?? null,
      },
    });
    // 새 호실은 계약이 없으므로 항상 공실(VACANT)이다
    return created({ unit: toUnitSummary({ ...row, leases: [] }) });
  } catch (error) {
    if (isUniqueViolation(error)) return fail("CONFLICT", `이미 있는 호실입니다: ${input.label}`);
    throw error;
  }
}
