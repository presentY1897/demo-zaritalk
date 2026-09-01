"use client";

/**
 * 공개 고지서 열람 신호 (T1.8) — 화면에는 아무것도 그리지 않는다.
 *
 * 마운트되면 `GET /api/notices/[token]` 을 한 번 부른다. 그 호출이
 * **최초 1회 `openedAt` 기록 + `notice_view` 적재**를 함께 처리한다.
 *
 * 페이지는 서버 렌더라 링크 미리보기 봇(카카오톡·슬랙 OG 크롤러)도 HTML 을 가져간다.
 * 봇은 JS 를 돌리지 않으므로 이 컴포넌트가 실행되지 않고, 그래서 "열람"이 사람의 열람으로 남는다.
 */
import { useNoticeOpen } from "./hooks";
import type { NoticeCtaVariant } from "./cta";

export function NoticeOpenTracker({
  token,
  variant,
}: {
  token: string;
  variant: NoticeCtaVariant;
}) {
  useNoticeOpen(token, variant);
  return null;
}
