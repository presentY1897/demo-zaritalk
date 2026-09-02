/**
 * 실거래가 수집 트리거 화면이 서버·클라이언트에서 함께 쓰는 상수·타입 (T4.3).
 * `actions.ts` 는 `"use server"` 파일이라 **async 함수 말고는 export 할 수 없어서** 여기로 뺐다.
 *
 * 어드민은 별도 Next 앱이라 `apps/web/src/features/**` 를 import 할 수 없다. 그래서 여기 타입은
 * **web 응답을 읽기 위한 미러**일 뿐이고 규칙은 하나도 들고 있지 않다(T2.5 어드민과 같은 원칙).
 * 지역 선택지도 web 이 검증하므로 여기서는 **자주 쓰는 몇 곳만 단축 버튼**으로 두고,
 * 비우면 web 이 "구독 지역 + 최근 수집 지역" 을 스스로 고른다.
 */

export const WEB_URL_FALLBACK = "http://localhost:3000";

/** `POST /api/deals/sync` 응답 본문 — web 의 `DealSyncResultDto` 와 같은 모양이다. */
export type DealSyncSummary = {
  ok: true;
  ranAt: string;
  targets: { lawdCd: string; regionLabel: string; dealYm: string }[];
  regionsScanned: number;
  monthsScanned: number;
  requests: number;
  fetched: number;
  created: number;
  skipped: number;
  discarded: number;
  failures: {
    lawdCd: string;
    dealYm: string;
    endpoint: "TRADE" | "RENT";
    reason: string;
    status: number | null;
  }[];
  alertsSent: number;
  durationMs: number;
  triggeredBy: "CRON" | "ADMIN";
};

export type TriggerDealSyncResult =
  | { ok: true; url: string; summary: DealSyncSummary }
  | { ok: false; url: string; status: number | null; message: string };

/** 끝 슬래시를 떼어 `${base}/api/...` 로 이어 붙일 수 있게 한다. */
export function resolveWebUrl(raw: string | undefined): string {
  return (raw || WEB_URL_FALLBACK).replace(/\/+$/, "");
}

/** 데모에서 자주 고르는 지역 — 시드 건물이 있는 성동구·강남구를 앞에 둔다 */
export const QUICK_REGIONS: { code: string; label: string }[] = [
  { code: "", label: "자동 (구독·최근 수집 지역)" },
  { code: "11200", label: "서울 성동구" },
  { code: "11680", label: "서울 강남구" },
  { code: "11710", label: "서울 송파구" },
  { code: "11440", label: "서울 마포구" },
  { code: "41130", label: "경기 성남시" },
];

/** `YYYYMM` 여섯 자리인가 — 화면이 버튼을 잠글 때만 쓴다(진짜 검증은 web 의 zod) */
export function isDealYm(value: string): boolean {
  if (!/^\d{6}$/.test(value)) return false;
  const month = Number(value.slice(4, 6));
  return month >= 1 && month <= 12;
}

/** 이번 달·지난달 `YYYYMM` (KST) — 입력 칸 기본값 */
export function defaultMonths(now: Date = new Date()): string[] {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  const month = kst.getUTCMonth() + 1;
  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  return [
    `${year}${String(month).padStart(2, "0")}`,
    `${prev.year}${String(prev.month).padStart(2, "0")}`,
  ];
}
