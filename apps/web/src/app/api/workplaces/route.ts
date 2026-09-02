/**
 * `GET·POST /api/workplaces` — 내 근무지 목록·등록 (T3.4).
 *
 * **본인 프로필 것만** 다룬다 — 목록은 세입자 프로필 id 로 걸러 조회하고(남의 것이 섞일 수 없다),
 * 등록은 로그인한 계정의 세입자 프로필에 붙인다(요청 본문으로 프로필을 지정할 수 없다).
 *
 * ```jsonc
 * // POST 요청 — 좌표는 주소 검색(`/api/address/search`)에서 고른 값이다
 * { "label": "회사", "address": "서울 강남구 강남대로 396", "lat": 37.49794, "lng": 127.02762 }
 * // 201 { "workplace": { id, label, address, lat, lng, createdAt } }
 * ```
 *
 * | 실패 | status · code |
 * |---|---|
 * | 비로그인 | 401 `UNAUTHORIZED` |
 * | 세입자 프로필 없음 | 403 `FORBIDDEN` |
 * | 라벨 빈 값·**좌표가 대한민국(위 33~39 / 경 124~132) 밖** | 400 `VALIDATION_ERROR` |
 * | 같은 이름의 근무지가 이미 있음 | 409 `CONFLICT` |
 * | 등록 상한(5곳) 초과 | 409 `CONFLICT` |
 *
 * **T3.5(통근시간)** 는 이 목록을 기준점으로 쓴다 — 서버 쪽에서는 `listWorkplaces` 를 직접 부르면 된다.
 */
import { prisma } from "@zari/db";
import { requireTenant } from "@/features/tenant/ownership";
import { countWorkplaces, listWorkplaces, toWorkplaceDto } from "@/features/workplace/queries";
import { createWorkplaceSchema, WORKPLACE_MAX } from "@/features/workplace/schema";
import { created, fail, ok, parseJson } from "@/lib/api/response";

export async function GET(): Promise<Response> {
  const tenant = await requireTenant();
  if (tenant.response) return tenant.response;

  const workplaces = await listWorkplaces(tenant.data.profile.id);
  return ok({ workplaces });
}

export async function POST(request: Request): Promise<Response> {
  const tenant = await requireTenant();
  if (tenant.response) return tenant.response;

  const parsed = await parseJson(request, createWorkplaceSchema);
  if (parsed.response) return parsed.response;
  const input = parsed.data;
  const tenantProfileId = tenant.data.profile.id;

  if ((await countWorkplaces(tenantProfileId)) >= WORKPLACE_MAX) {
    return fail("CONFLICT", `근무지는 ${WORKPLACE_MAX}곳까지 등록할 수 있습니다.`);
  }

  // 스키마에 unique 제약이 없어(다른 세입자와 이름이 겹칠 수 있으므로) 여기서 본다
  const duplicate = await prisma.workplace.findFirst({
    where: { tenantProfileId, label: input.label },
    select: { id: true },
  });
  if (duplicate) return fail("CONFLICT", `이미 있는 근무지입니다: ${input.label}`);

  const row = await prisma.workplace.create({
    data: {
      tenantProfileId,
      label: input.label,
      address: input.address,
      lat: input.lat,
      lng: input.lng,
    },
  });
  return created({ workplace: toWorkplaceDto(row) });
}
