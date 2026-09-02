/**
 * 블라인드 노출 규칙 — **정의는 여기 한 곳뿐이다** (T4.1·T4.2).
 *
 * 커뮤니티는 글이 사라지는 경로가 둘이다. 스키마에는 `deletedAt` 컬럼 하나뿐이라
 * **어느 쪽으로 사라졌는지는 신고 이력으로 가른다**(스키마를 늘리지 않으려는 선택 —
 * task 문서의 "스키마가 필요했지만 만들지 않은 것" 참고).
 *
 * | 상태 | 판정 |
 * |---|---|
 * | `VISIBLE` 정상 | `deletedAt == null` |
 * | `BLINDED` 블라인드 | `deletedAt != null` **이고** 그 대상에 `Report.status = ACTIONED` 가 있다 |
 * | `REMOVED` 작성자 삭제 | `deletedAt != null` 이고 처리된 신고가 없다 |
 *
 * ## 노출 규칙표
 *
 * | 상태 | 목록(`GET /api/posts`) | 상세(`GET /api/posts/[id]`) | 본문 | 좋아요·댓글·신고 |
 * |---|---|---|---|---|
 * | 정상 | 보인다 | 200 | 그대로 | 가능 |
 * | **블라인드** | **남는다** — 제목·본문 자리에 안내문(좋아요·댓글 수·작성자·시각은 유지) | 200 | **가림**(아래 예외) | **막는다 409** |
 * | **작성자 삭제** | **빠진다** | **404** | — | — |
 *
 * 블라인드 글을 목록에서 통째로 빼지 않는 이유: 달린 댓글이 통째로 증발하면 대화가 끊기고,
 * "왜 없어졌는지" 가 화면에서 사라진다. 자리를 남기고 내용만 가리는 쪽이 모더레이션의 결과를
 * 커뮤니티에 드러낸다. 반대로 **작성자가 스스로 지운 글은 흔적을 남기지 않는다** — 남길 이유가 없다.
 *
 * ## 누가 원문을 보나
 *
 * | 보는 사람 | 블라인드 글·댓글의 원문 |
 * |---|---|
 * | **작성자 본인** | **보인다** + "블라인드" 배지. 왜 가려졌는지 알고 다시 쓰려면 원문이 필요하다 |
 * | **어드민**(`User.isAdmin`) | **보인다**. 심사하려면 봐야 한다(신고 큐의 대상 미리보기도 같은 규칙) |
 * | 그 밖의 사용자 | **가려진다** — 안내문만 |
 *
 * 원문이 보이는 사람에게도 **수정·좋아요·댓글·신고는 막힌다**(`canInteract`) — 보는 것과
 * 되살리는 것은 다르다. 되살리기(블라인드 해제)는 이 task 범위가 아니다.
 *
 * `@zari/db` 를 import 하지 않는다 — 순수 판정 함수라 DB 없이 테스트한다.
 */

/** 글·댓글 한 건의 모더레이션 상태 */
export type ModerationState = "VISIBLE" | "BLINDED" | "REMOVED";

/** 보는 사람과 대상의 관계 — 원문 노출을 가르는 유일한 기준 */
export type ViewerRelation = "AUTHOR" | "ADMIN" | "OTHER";

/** 화면에 박히는 안내문 — 목록·상세·댓글이 같은 문구를 쓴다 */
export const BLIND_NOTICE = {
  postTitle: "블라인드 처리된 글입니다",
  postBody: "신고가 접수되어 관리자가 가린 글입니다.",
  commentBody: "블라인드 처리된 댓글입니다.",
} as const;

/**
 * `deletedAt` + "처리된 신고가 있는가" 로 상태를 가른다.
 * 블라인드는 신고 처리(`ACTIONED`)로만 생기므로 이 둘로 정확히 갈린다.
 */
export function moderationStateOf(input: {
  deletedAt: Date | null;
  hasActionedReport: boolean;
}): ModerationState {
  if (!input.deletedAt) return "VISIBLE";
  return input.hasActionedReport ? "BLINDED" : "REMOVED";
}

/** 목록·스레드에 자리를 남기는가 — 작성자 삭제만 빠진다 */
export function isListed(state: ModerationState): boolean {
  return state !== "REMOVED";
}

/** 원문(제목·본문)을 그대로 보여 주는가 */
export function canSeeOriginal(state: ModerationState, relation: ViewerRelation): boolean {
  if (state === "VISIBLE") return true;
  if (state === "REMOVED") return false;
  return relation === "AUTHOR" || relation === "ADMIN";
}

/** 좋아요·댓글·신고·수정이 가능한가 — 블라인드·삭제는 전부 막힌다 */
export function canInteract(state: ModerationState): boolean {
  return state === "VISIBLE";
}

/** 상호작용을 막을 때 쓰는 409 문구 */
export function blockedReason(state: ModerationState, target: "POST" | "COMMENT"): string {
  const noun = target === "POST" ? "글" : "댓글";
  if (state === "BLINDED") return `블라인드 처리된 ${noun}에는 더 이상 참여할 수 없습니다.`;
  return `삭제된 ${noun}입니다.`;
}
