/**
 * `/events` 화면이 읽는 응답 타입 미러 (T6.3).
 */
import type { PageMeta } from "../_shell/format";

export type AdminEventRow = {
  id: string;
  name: string;
  /** 앞 8자리만 온다 — 가명 식별자라 비교만 되면 충분하다 */
  anonId: string;
  userId: string | null;
  userName: string | null;
  path: string | null;
  sessionId: string | null;
  props: string | null;
  createdAt: string;
};

export type AdminHourBucket = { hour: number; count: number };

export type AdminEventList = {
  events: AdminEventRow[];
  names: { name: string; count: number }[];
  hourly: AdminHourBucket[];
  range: { from: string; to: string };
  sampled: number;
  sampleTruncated: boolean;
  page: PageMeta;
};

export type EventListResult =
  | ({ ok: true } & AdminEventList)
  | { ok: false; status: number | null; message: string };

/** 이름 탭은 많아질 수 있어 상위 N개만 띄우고 나머지는 검색으로 넘긴다 */
export const NAME_TAB_LIMIT = 8;
