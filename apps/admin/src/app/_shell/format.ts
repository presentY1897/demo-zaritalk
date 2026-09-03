/**
 * 어드민 조회 화면 공용 표시 포맷 + 쿼리 조립 (T6.3).
 *
 * ## 시각은 언제나 **KST 로 고정 변환**한다
 * 어드민 서버의 시스템 타임존은 배포 환경에 따라 UTC 일 수 있다. `toLocaleString()` 에 맡기면
 * 로컬에서는 맞고 배포에서는 9시간 어긋난다 — 운영자가 "언제 보냈나" 를 잘못 읽는다.
 * 그래서 9시간을 더해 UTC 게터로 읽는다(원장 엔진이 `kstToday()` 로 한 것과 같은 규칙).
 *
 * 순수 모듈이라 서버·클라이언트 어디서든 쓴다.
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** API 가 주는 페이지 메타 미러 — `apps/web/src/features/admin/pagination.ts` 와 같은 모양 */
export type PageMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
};

export const EMPTY_PAGE: PageMeta = {
  page: 1,
  pageSize: 20,
  total: 0,
  totalPages: 0,
  hasPrev: false,
  hasNext: false,
};

const pad = (value: number) => String(value).padStart(2, "0");

function kst(iso: string): Date {
  return new Date(new Date(iso).getTime() + KST_OFFSET_MS);
}

/** ISO 타임스탬프 → "2026.09.03 14:05" (KST) */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = kst(iso);
  return `${d.getUTCFullYear()}.${pad(d.getUTCMonth() + 1)}.${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** `YYYY-MM-DD`(@db.Date) 또는 ISO → "2026.09.03" */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.replaceAll("-", ".");
  const d = kst(value);
  return `${d.getUTCFullYear()}.${pad(d.getUTCMonth() + 1)}.${pad(d.getUTCDate())}`;
}

export function formatKrw(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

export function formatCount(value: number): string {
  return value.toLocaleString("ko-KR");
}

/** 프로필 유형 라벨 — web 의 `PROFILE_TYPE_META` 와 같은 문구 */
export const PROFILE_TYPE_LABEL: Record<string, string> = {
  LANDLORD: "임대인",
  TENANT: "세입자",
  REALTOR: "중개인",
  MASTER: "협력업체",
};

/**
 * 현재 필터를 유지한 채 일부만 바꾼 경로를 만든다.
 * 값이 `undefined`·빈 문자열이면 그 파라미터를 뺀다 — "필터 해제" 가 자연스럽게 표현된다.
 */
export function hrefWith(
  base: string,
  current: Record<string, string | undefined>,
  patch: Record<string, string | number | undefined> = {},
): string {
  const params = new URLSearchParams();
  const merged: Record<string, string | number | undefined> = { ...current, ...patch };
  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined || value === "") continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

/** `searchParams` 의 `string | string[] | undefined` 를 한 값으로 좁힌다 */
export function firstParam(
  value: string | string[] | undefined,
): string | undefined {
  const picked = Array.isArray(value) ? value[0] : value;
  return picked === undefined || picked === "" ? undefined : picked;
}
