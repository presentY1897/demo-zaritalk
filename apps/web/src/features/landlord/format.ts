/**
 * 자산 화면 표시 포맷 (T1.1) — 순수 함수, 클라이언트에서도 쓴다.
 */

/** 1015000 → "1,015,000원" */
export function formatKrw(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

/** 20000000 → "2,000만원" (보증금처럼 큰 금액을 카드에 짧게 적을 때) */
export function formatManwon(amount: number): string {
  if (amount === 0) return "0원";
  if (amount % 10_000 !== 0) return formatKrw(amount);
  return `${(amount / 10_000).toLocaleString("ko-KR")}만원`;
}

/** "2026-03-01" → "2026.03.01" */
export function formatDate(isoDate: string): string {
  return isoDate.slice(0, 10).replaceAll("-", ".");
}

/** 전세(월세 0)면 "전세", 아니면 "월세" */
export function leaseKindLabel(monthlyRent: number): string {
  return monthlyRent > 0 ? "월세" : "전세";
}

/** 면적 33.5 → "33.5㎡ (10.1평)" */
export function formatArea(areaM2: number): string {
  const pyeong = areaM2 / 3.3058;
  return `${areaM2}㎡ (${pyeong.toFixed(1)}평)`;
}
