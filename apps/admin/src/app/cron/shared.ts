/**
 * 크론 트리거 화면이 서버·클라이언트에서 함께 쓰는 상수·타입 (T1.4).
 * `actions.ts` 는 `"use server"` 파일이라 **async 함수 말고는 export 할 수 없어서** 여기로 뺐다.
 */

export const WEB_URL_FALLBACK = "http://localhost:3000";

/** `POST /api/cron/daily` 응답 본문 — web 의 `DailyCronResult` 와 같은 모양이다. */
export type DailyCronSummary = {
  ok: true;
  ranAt: string;
  today: string;
  targetMonth: { year: number; month: number };
  leasesScanned: number;
  chargesCreated: number;
  chargesSkipped: number;
  carriedOverAdjusted: number;
  statusChanged: number;
  statusBreakdown: Record<string, number>;
  expiryNoticesSent: number;
  expiryNoticesSkipped: number;
  durationMs: number;
};

export type TriggerCronResult =
  | { ok: true; url: string; summary: DailyCronSummary }
  | { ok: false; url: string; status: number | null; message: string };

/** 끝 슬래시를 떼어 `${base}/api/...` 로 이어 붙일 수 있게 한다. */
export function resolveWebUrl(raw: string | undefined): string {
  return (raw || WEB_URL_FALLBACK).replace(/\/+$/, "");
}
