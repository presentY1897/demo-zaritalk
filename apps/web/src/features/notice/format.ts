/**
 * 고지서 화면 표시 포맷 (T1.7 · T1.8) — 순수 함수, 서버·클라이언트 공용.
 *
 * 타임스탬프는 **KST 로 고정 변환**한다. `toLocaleString` 은 실행 환경(서버 Node vs 브라우저)의
 * 타임존·ICU 에 따라 달라져 하이드레이션 불일치를 만들기 때문에 쓰지 않는다.
 */

/** ISO 8601 → "2026.08.20 09:00" (KST) */
export function formatKstDateTime(iso: string): string {
  const kst = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000).toISOString();
  return `${kst.slice(0, 4)}.${kst.slice(5, 7)}.${kst.slice(8, 10)} ${kst.slice(11, 16)}`;
}

/** ISO 8601 → "2026.08.20" (KST) */
export function formatKstDate(iso: string): string {
  return formatKstDateTime(iso).slice(0, 10);
}

/** `YYYY-MM-DD` → "2026.09.25" */
export function formatDateKey(value: string): string {
  return value.replaceAll("-", ".");
}

/** 납부기한까지 남은 일수 → "D-24" · "오늘" · "24일 지남" */
export function formatDueBadge(days: number): string {
  if (days > 0) return `D-${days}`;
  if (days === 0) return "오늘";
  return `${Math.abs(days)}일 지남`;
}
