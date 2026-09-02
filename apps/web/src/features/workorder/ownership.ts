/**
 * 작업 의뢰 소유권 가드 (T5.1).
 *
 * 의뢰는 **임대인 자원**이다 — 판정은 T1.1 `features/landlord/ownership.ts` 와 같은
 * "내 것인가" 한 방향이고, 규약(`Guarded<T>`)·상태 코드도 그대로 쓴다.
 *
 * ```ts
 * const landlord = await requireLandlord();
 * if (landlord.response) return landlord.response;          // 401 · 403
 *
 * const owned = await requireOwnWorkOrder(landlord.data, id);
 * if (owned.response) return owned.response;                // 404 · 403
 * ```
 *
 * | 상황 | status · code |
 * |---|---|
 * | 비로그인·만료 세션 | 401 `UNAUTHORIZED` |
 * | 임대인 프로필 없음 | 403 `FORBIDDEN` |
 * | 없는 의뢰 id | 404 `NOT_FOUND` |
 * | 남의 의뢰 | 403 `FORBIDDEN` |
 *
 * 남의 의뢰를 404 로 감추지 않고 403 을 주는 것은 T1.1·T2.6 과 같은 선택이다.
 * **화면(서버 컴포넌트)만 `notFound()`(404)로 막는다.**
 */
import { prisma, type Building, type Unit, type WorkOrder } from "@zari/db";
import type { Guarded, LandlordSession } from "@/features/landlord/ownership";
import { fail } from "@/lib/api/response";

/** 의뢰 + 대상 건물·호실 — push 매칭의 원점 좌표가 건물에 있다 */
export type WorkOrderWithPlace = WorkOrder & {
  building: Building | null;
  unit: Unit | null;
};

/** 내 의뢰인지 확인. 404(없음) · 403(남의 의뢰). */
export async function requireOwnWorkOrder(
  landlord: LandlordSession,
  workOrderId: string,
): Promise<Guarded<WorkOrderWithPlace>> {
  const workOrder = await prisma.workOrder.findUnique({
    where: { id: workOrderId },
    include: { building: true, unit: true },
  });
  if (!workOrder) return { response: fail("NOT_FOUND", "작업 의뢰를 찾을 수 없습니다.") };
  if (workOrder.requesterProfileId !== landlord.profile.id) {
    return { response: fail("FORBIDDEN", "내 작업 의뢰만 관리할 수 있습니다.") };
  }
  return { data: workOrder };
}
