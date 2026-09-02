/**
 * 커뮤니티 화면 표시값 (T4.1) — 라벨·톤을 화면마다 다시 적지 않게 한 곳에 모은다.
 * `Badge` 는 `tone` 만 받는다([T0.6](../../../../../docs/tasks/t0.6-ui-tokens.md)) — 색을 직접 쓰지 않는다.
 */
import type { BadgeTone } from "@zari/ui";
import type { PostSort } from "./cursor";
import type { ProfileTypeValue } from "./types";

/** 글쓴이 프로필 유형 배지 — 네 유형이 서로 구분되게 톤을 나눈다 */
export const PROFILE_TYPE_META: Record<ProfileTypeValue, { label: string; tone: BadgeTone }> = {
  LANDLORD: { label: "임대인", tone: "brand" },
  TENANT: { label: "세입자", tone: "info" },
  REALTOR: { label: "중개인", tone: "success" },
  MASTER: { label: "협력업체", tone: "warning" },
};

/** 최신·인기 탭 */
export const SORT_TABS: { key: PostSort; label: string; hint: string }[] = [
  { key: "latest", label: "최신", hint: "최근에 올라온 순" },
  { key: "popular", label: "인기", hint: "좋아요가 많은 순" },
];

/** "2026.09.02 14:05" */
export function formatMoment(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
