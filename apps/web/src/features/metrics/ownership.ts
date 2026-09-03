/**
 * 지표 API 권한 가드 (T6.2).
 *
 * **인증을 새로 발명하지 않았다.** 어드민 판정은 [T2.5](../../../../../docs/tasks/t2.5-refund-review.md)
 * 의 `requireRefundAdmin` 한 곳이 갖고 있고(세션 `isAdmin` → 없으면 `x-admin-secret`),
 * 실거래가 수집(T4.3 `features/deals/ownership.ts`)도 같은 함수를 빌려 쓴다. 여기도 그대로 쓴다.
 *
 * | 통로 | 판정 |
 * |---|---|
 * | 세션 쿠키 | `isAdmin` 이면 통과, 아니면 **403** |
 * | `x-admin-secret` | 세션이 없을 때만. 값이 맞으면 DB 의 `isAdmin` 계정을 찾는다. 없으면 **403** |
 * | 둘 다 없음 | **401** |
 *
 * 어드민 앱(3001)에는 로그인이 없어 **서버 액션**이 시크릿을 붙여 부른다 —
 * 시크릿은 어드민 서버에만 있고 브라우저 번들에 실리지 않는다. T6.3 이 어드민 로그인을 붙이면
 * `requireRefundAdmin` 의 시크릿 분기만 사라지고 이 파일은 그대로다.
 */
import type { Guarded } from "@/features/landlord/ownership";
import { requireRefundAdmin, type AdminActor } from "@/features/refund/ownership";

export { ADMIN_SECRET_HEADER } from "@/features/refund/ownership";

/** 지표 조회는 어드민만. 401 · 403 */
export function requireMetricsAdmin(request: Request): Promise<Guarded<AdminActor>> {
  return requireRefundAdmin(request);
}
