/**
 * `GET /api/leases/[id]/charges` — 계약의 청구 목록(납부 기록 포함) (T1.5).
 *
 * 응답의 `status`·`outstanding`·`overdueDays`·`lines` 는 저장된 컬럼이 아니라
 * 원장 엔진 `describeCharge(charge, kstToday())` 가 다시 판정·분해한 값이다(`features/lease/queries.ts`).
 * 최신 월이 먼저 온다.
 */
import { requireLandlord } from "@/features/landlord/ownership";
import { requireOwnedLease } from "@/features/lease/ownership";
import { listCharges } from "@/features/lease/queries";
import { ok } from "@/lib/api/response";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context): Promise<Response> {
  const landlord = await requireLandlord();
  if (landlord.response) return landlord.response;

  const { id } = await context.params;
  const owned = await requireOwnedLease(landlord.data, id);
  if (owned.response) return owned.response;

  const charges = await listCharges(id);
  return ok({ charges });
}
