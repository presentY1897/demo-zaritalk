/**
 * `GET /api/landlord/ledger?year=&buildingId=` — 임대장부 월×건물 matrix + 항목별 합계 (T1.6).
 *
 * 장부는 별도 입력이 없다. 원장(청구·납부)에서 파생하므로 이 라우트는 읽기 전용이다.
 * 소유권 판정은 T1.1 의 `requireLandlord`·`requireOwnedBuilding` 을 그대로 쓴다.
 *
 * | 상황 | status · code |
 * |---|---|
 * | 비로그인 | 401 `UNAUTHORIZED` |
 * | 임대인 프로필 없음 | 403 `FORBIDDEN` |
 * | `year` 형식·범위 오류 | 400 `VALIDATION_ERROR` |
 * | 없는 `buildingId` | 404 `NOT_FOUND` |
 * | 타인 건물 `buildingId` | 403 `FORBIDDEN` |
 */
import { requireLandlord, requireOwnedBuilding } from "@/features/landlord/ownership";
import { currentLedgerYear, getLedgerYear } from "@/features/ledger/queries";
import { ledgerQuerySchema } from "@/features/ledger/schema";
import { ok, parseQuery } from "@/lib/api/response";

export async function GET(request: Request): Promise<Response> {
  const landlord = await requireLandlord();
  if (landlord.response) return landlord.response;

  const parsed = parseQuery(request, ledgerQuerySchema);
  if (parsed.response) return parsed.response;
  const { year, buildingId } = parsed.data;

  if (buildingId) {
    // 남의 건물로 남의 수입을 훔쳐보지 못하게 필터도 소유권을 먼저 확인한다
    const owned = await requireOwnedBuilding(landlord.data, buildingId);
    if (owned.response) return owned.response;
  }

  const ledger = await getLedgerYear(
    landlord.data.profile.id,
    year ?? currentLedgerYear(),
    buildingId ?? null,
  );
  return ok(ledger);
}
