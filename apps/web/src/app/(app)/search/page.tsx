import { PlaceholderScreen } from "@/features/shell/PlaceholderScreen";

/** `/search` — 탭 목적지 자리표. T3.2 에서 실제 화면으로 교체한다(T0.5가 경로만 확정). */
export default function Page() {
  return (
    <PlaceholderScreen
      title="매물"
      owner="T3.2"
      description="카카오맵 지도 + 리스트 하이브리드 매물 탐색(비로그인 허용)."
      href="/search"
    />
  );
}
