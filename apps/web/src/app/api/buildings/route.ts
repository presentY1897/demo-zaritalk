/**
 * `GET·POST /api/buildings` — 내 건물 목록·생성 (T1.1).
 *
 * 소유권 판정은 전부 `features/landlord/ownership.ts` 가 한다(Phase 1 공용).
 * 목록 응답은 서버 컴포넌트가 내려주는 초기 데이터와 같은 함수(`listBuildings`)로 만든다.
 */
import { prisma } from "@zari/db";
import { getBuildingSummary, listBuildings } from "@/features/landlord/queries";
import { requireLandlord } from "@/features/landlord/ownership";
import { createBuildingSchema } from "@/features/landlord/schema";
import { created, fail, ok, parseJson } from "@/lib/api/response";

export async function GET(): Promise<Response> {
  const landlord = await requireLandlord();
  if (landlord.response) return landlord.response;

  const buildings = await listBuildings(landlord.data.profile.id);
  return ok({ buildings });
}

export async function POST(request: Request): Promise<Response> {
  const landlord = await requireLandlord();
  if (landlord.response) return landlord.response;

  const parsed = await parseJson(request, createBuildingSchema);
  if (parsed.response) return parsed.response;
  const input = parsed.data;

  const row = await prisma.building.create({
    data: {
      ownerProfileId: landlord.data.profile.id,
      name: input.name,
      address: input.address,
      // 주소 검색(카카오)이 없어 도로명은 선택 입력이다 — T3.x 에서 주소 검색으로 채운다
      roadAddress: input.roadAddress ?? null,
      lat: input.lat,
      lng: input.lng,
      note: input.note ?? null,
    },
  });

  const building = await getBuildingSummary(row.id);
  if (!building) return fail("INTERNAL_ERROR", "건물을 저장하지 못했습니다.");
  return created({ building });
}
