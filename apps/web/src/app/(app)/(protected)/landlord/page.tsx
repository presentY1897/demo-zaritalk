import { PlaceholderScreen } from "@/features/shell/PlaceholderScreen";

/** `/landlord` — 탭 목적지 자리표. T1.9 에서 실제 화면으로 교체한다(T0.5가 경로만 확정). */
export default function Page() {
  return (
    <PlaceholderScreen
      title="임대인 홈"
      owner="T1.9"
      description="이번 달 수납 현황·연체 리스트·만기 임박 계약을 보여 주는 임대인 대시보드."
      href="/landlord"
    />
  );
}
