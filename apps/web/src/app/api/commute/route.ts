/**
 * `POST /api/commute` — (호실, 근무지) 한 쌍의 통근시간 조회 (T3.5).
 *
 * **T3.2·T3.3 이 만들어 둔 표시 자리를 켜는 유일한 스위치**다. 목록 배지·상세 시트는
 * `CommuteCache` 를 읽기만 하므로(`features/listing/commute.ts`), 여기서 행을 채우면
 * 그쪽 코드를 고치지 않고 배지가 켜진다.
 *
 * ```jsonc
 * // 요청 — 좌표는 보내지 않는다(서버가 건물·근무지에서 직접 읽는다)
 * { "unitId": "cmf0…", "workplaceId": "cmf0…" }
 *
 * // 200
 * {
 *   "unitId": "cmf0…",
 *   "commute": { "workplaceId": "cmf0…", "workplaceLabel": "회사",
 *                "transitMinutes": 34, "drivingMinutes": 28,
 *                "fetchedAt": "2026-09-03T…", "mockModes": ["transit"] },
 *   "cached": false,          // true 면 외부 호출 0건
 *   "failures": [{ "mode": "car", "reason": "RATE_LIMITED", "status": 429 }]
 * }
 * ```
 *
 * | 실패 | status · code |
 * |---|---|
 * | 비로그인·만료 세션 | 401 `UNAUTHORIZED` |
 * | 세입자 프로필 없음 | 403 `FORBIDDEN` |
 * | `unitId`·`workplaceId` 누락·64자 초과 | 400 `VALIDATION_ERROR` |
 * | 없는 근무지 | 404 `NOT_FOUND` |
 * | **남의 근무지** | 403 `FORBIDDEN` |
 * | 없는 호실 · **매물이 한 번도 올라온 적 없는 호실** | 404 `NOT_FOUND` |
 * | 건물·근무지 좌표가 대한민국 범위 밖 | 400 `VALIDATION_ERROR` |
 * | **두 이동수단 모두 실패** | 500 `INTERNAL_ERROR` — 캐시는 만들지 않는다 |
 *
 * ## 왜 "매물이 있는 호실" 만 받나
 *
 * 통근시간은 **매물을 고르려고** 보는 값이다. 아무 `unitId` 나 받으면 남의 집(임대 중인 호실)을
 * 향한 계산을 시켜 캐시를 채울 수 있고, 그 호실이 존재하는지도 알려 주게 된다. 그래서
 * "매물이 하나라도 붙은 호실" 로 좁혔다 — `/listings/[id]` 는 예약·종료 매물도 열리므로
 * **상태는 보지 않는다**(공유된 링크에서 눌러도 되어야 한다).
 *
 * ## 남의 근무지에는 403 을 준다 (공개 조회와 다르다)
 *
 * `GET /api/listings` 의 `workplaceId` 는 **조용히 무시**한다 — 비로그인도 부르는 공개
 * 엔드포인트라 "그 id 의 근무지가 있다" 가 새면 안 되기 때문이다(T3.2 문서). 반면 여기는
 * **로그인 세입자 전용 쓰기**라 T3.4 `requireOwnWorkplace` 규약(404·403)을 그대로 따른다.
 *
 * ## 캐시 · 실패 처리
 *
 * TTL(완전한 값 7일 · 부분 결과 1시간)과 그 근거는 `features/commute/cache.ts` 주석에 있다.
 * 한쪽이 실패해도 나머지는 저장하고(`failures` 로 알린다), 둘 다 실패했을 때만 500 이다.
 * **화면은 어느 경우에도 죽지 않는다** — 상세 시트가 실패를 문구로 받아 낸다.
 */
import { prisma } from "@zari/db";
import { isWithinKorea } from "@/features/address/coords";
import { isCommuteFresh, readCommuteRow, toCommuteDto, upsertCommute } from "@/features/commute/cache";
import { defaultCommuteProviders } from "@/features/commute/providers";
import { commuteLookupSchema } from "@/features/commute/schema";
import { computeCommute } from "@/features/commute/service";
import type { CommuteLookupResponse } from "@/features/commute/types";
import { requireTenant } from "@/features/tenant/ownership";
import { requireOwnWorkplace } from "@/features/workplace/ownership";
import { fail, ok, parseJson } from "@/lib/api/response";

export async function POST(request: Request): Promise<Response> {
  const tenant = await requireTenant();
  if (tenant.response) return tenant.response;

  const parsed = await parseJson(request, commuteLookupSchema);
  if (parsed.response) return parsed.response;
  const { unitId, workplaceId } = parsed.data;

  const owned = await requireOwnWorkplace(tenant.data, workplaceId);
  if (owned.response) return owned.response;
  const workplace = owned.data;

  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
    select: {
      id: true,
      building: { select: { lat: true, lng: true } },
      // "매물이 붙은 호실인가" 만 본다 — 상태(OPEN·RESERVED·CLOSED)는 가리지 않는다
      listings: { select: { id: true }, take: 1 },
    },
  });
  if (!unit || unit.listings.length === 0) {
    return fail("NOT_FOUND", "매물이 등록된 호실이 아닙니다.");
  }

  const origin = { lat: unit.building.lat, lng: unit.building.lng };
  const destination = { lat: workplace.lat, lng: workplace.lng };
  // 좌표는 등록 시점에 검증되지만(T1.1·T3.4) 시드·수기 데이터가 섞일 수 있어 한 번 더 본다.
  // 여기서 막지 않으면 카카오에 이상값을 보내 쿼터만 태우고 "경로 없음" 을 받는다.
  if (!isWithinKorea(origin.lat, origin.lng) || !isWithinKorea(destination.lat, destination.lng)) {
    return fail(
      "VALIDATION_ERROR",
      "건물 또는 근무지 좌표가 올바르지 않아 통근시간을 계산할 수 없습니다.",
    );
  }

  const cached = await readCommuteRow(unitId, workplaceId);
  if (cached && isCommuteFresh(cached)) {
    const body: CommuteLookupResponse = {
      unitId,
      commute: toCommuteDto(cached, workplace.label),
      cached: true,
      failures: [],
    };
    return ok(body);
  }

  const providers = defaultCommuteProviders();
  const computation = await computeCommute(origin, destination, providers);

  if (!computation.anySuccess) {
    // 캐시를 만들지 않는다 — 빈 행을 남기면 다음 요청이 "부분 결과" 로 착각해 1시간을 기다린다
    return fail("INTERNAL_ERROR", "통근시간을 계산하지 못했습니다. 잠시 후 다시 시도해 주세요.", {
      failures: computation.failures,
    });
  }

  const row = await upsertCommute({ unitId, workplaceId, computation, providers });
  const body: CommuteLookupResponse = {
    unitId,
    commute: toCommuteDto(row, workplace.label),
    cached: false,
    failures: computation.failures,
  };
  return ok(body);
}
