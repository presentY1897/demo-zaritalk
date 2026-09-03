/**
 * 어드민 조회 API 의 권한 가드 (T6.3) — **판정을 새로 만들지 않는다.**
 *
 * `User.isAdmin` 이 유일한 기준이라는 규칙은 T2.5 환급 심사가 세웠고
 * (`features/refund/ownership.ts` 의 `requireRefundAdmin`), T4.2 신고 처리는 그것을
 * **복사하지 않고 그대로 다시 내보내** 썼다(`requireModerationAdmin`). T6.3 도 같은 선택이다 —
 * 판정이 두 벌이 되면 한쪽만 고쳐서 구멍이 난다.
 *
 * | 통로 | 판정 |
 * |---|---|
 * | ① 세션 쿠키 `zari_session` | `isAdmin` 이면 통과, 아니면 **403**. 어드민 앱은 로그인 때 받은 토큰을 `Cookie` 헤더로 실어 보낸다(T6.3) |
 * | ② 서비스 시크릿 `x-admin-secret` | 세션이 없을 때만 본다. DB 에서 `isAdmin` 계정을 찾아 행위자로 세운다. 없으면 **403** |
 * | ③ 둘 다 없음 | **401** |
 *
 * **조회 화면(`/users`·`/leases`·`/charges`·`/messages`·`/events`)은 ①만 쓴다.**
 * 어드민 앱의 조회용 호출은 시크릿을 아예 붙이지 않으므로(→ `_shell/web-client.ts`)
 * 세션이 끊기면 시크릿으로 슬쩍 넘어가는 일이 없다. ②는 기존 화면(환급·신고)과
 * 크론 트리거가 쓰던 서비스 경로를 그대로 남겨 둔 것이다.
 */
export {
  ADMIN_SECRET_HEADER,
  requireRefundAdmin as requireAdmin,
} from "@/features/refund/ownership";
export type { AdminActor } from "@/features/refund/ownership";
