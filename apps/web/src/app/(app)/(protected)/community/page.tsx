import { PlaceholderScreen } from "@/features/shell/PlaceholderScreen";

/** `/community` — 탭 목적지 자리표. T4.1 에서 실제 화면으로 교체한다(T0.5가 경로만 확정). */
export default function Page() {
  return (
    <PlaceholderScreen
      title="커뮤니티"
      owner="T4.1"
      description="지역 보드 — 최신·인기 탭, 글쓰기와 댓글·좋아요."
      href="/community"
    />
  );
}
