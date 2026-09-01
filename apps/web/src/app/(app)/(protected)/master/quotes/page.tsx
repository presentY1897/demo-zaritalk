import { PlaceholderScreen } from "@/features/shell/PlaceholderScreen";

/** `/master/quotes` — 탭 목적지 자리표. T5.3 에서 실제 화면으로 교체한다(T0.5가 경로만 확정). */
export default function Page() {
  return (
    <PlaceholderScreen
      title="견적"
      owner="T5.3"
      description="내가 제안한 견적 목록과 상태(제안·수락·거절)."
      href="/master/quotes"
    />
  );
}
