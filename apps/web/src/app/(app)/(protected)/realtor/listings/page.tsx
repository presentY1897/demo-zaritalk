import { PlaceholderScreen } from "@/features/shell/PlaceholderScreen";

/** `/realtor/listings` — 탭 목적지 자리표. T3.7 에서 실제 화면으로 교체한다(T0.5가 경로만 확정). */
export default function Page() {
  return (
    <PlaceholderScreen
      title="매물"
      owner="T3.7"
      description="수락한 요청으로 내가 맡은 매물 관리."
      href="/realtor/listings"
    />
  );
}
