import { PlaceholderScreen } from "@/features/shell/PlaceholderScreen";

/** `/master` — 탭 목적지 자리표. T5.2 에서 실제 화면으로 교체한다(T0.5가 경로만 확정). */
export default function Page() {
  return (
    <PlaceholderScreen
      title="마스터 홈(의뢰피드)"
      owner="T5.2"
      description="추천받은 의뢰(유료 push)와 전체 피드(업종·반경 매칭 pull)."
      href="/master"
    />
  );
}
