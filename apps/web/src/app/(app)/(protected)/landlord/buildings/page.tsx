import { PlaceholderScreen } from "@/features/shell/PlaceholderScreen";

/** `/landlord/buildings` — 탭 목적지 자리표. T1.1 에서 실제 화면으로 교체한다(T0.5가 경로만 확정). */
export default function Page() {
  return (
    <PlaceholderScreen
      title="자산"
      owner="T1.1"
      description="내 건물 목록과 호실 그리드(계약중·공실·연체) — 건물·호실 등록과 수정."
      href="/landlord/buildings"
    />
  );
}
