import { PlaceholderScreen } from "@/features/shell/PlaceholderScreen";

/** `/realtor` — 탭 목적지 자리표. T3.7 에서 실제 화면으로 교체한다(T0.5가 경로만 확정). */
export default function Page() {
  return (
    <PlaceholderScreen
      title="중개인 홈(수신함)"
      owner="T3.7"
      description="반경 안에서 받은 중개 요청 수신함 — 열람·수락·거절."
      href="/realtor"
    />
  );
}
