import { PlaceholderScreen } from "@/features/shell/PlaceholderScreen";

/** `/tenant` — 탭 목적지 자리표. T1.3 에서 실제 화면으로 교체한다(T0.5가 경로만 확정). */
export default function Page() {
  return (
    <PlaceholderScreen
      title="세입자 홈"
      owner="T1.3"
      description="내 계약 카드와 이번 달 납부 상태, 자리페이 결제·환급·민원 진입."
      href="/tenant"
    />
  );
}
