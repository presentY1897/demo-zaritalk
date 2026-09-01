/**
 * 프로필 전환 트래킹 이벤트 상수 (T0.5).
 *
 * 이름 규약은 T0.7 그대로 — `<domain>_<object>_<action>`, 소문자·숫자, 2~4마디.
 * 서버(`POST /api/track`)가 정규식으로 검증한다.
 *
 * > **위치에 대한 메모**: 원칙대로면 `@/lib/tracking/events` 의 `TRACK_EVENTS` 에 상수를
 * > 추가해야 하지만, 그 파일은 T0.7 소유라 병렬 작업 중 손대지 않았다. **T0.7·T0.5 가
 * > 함께 머지된 뒤 이 두 상수를 `TRACK_EVENTS` 로 옮기고 이 파일을 지운다.**
 */

export const PROFILE_TRACK_EVENTS = {
  /** 마이페이지에서 프로필 전환 시트를 열었을 때 */
  SWITCH_OPEN: "profile_switch_open",
  /** 전환 성공 — props: `{ from, to }` (프로필 유형) */
  SWITCH_COMPLETE: "profile_switch_complete",
} as const;
