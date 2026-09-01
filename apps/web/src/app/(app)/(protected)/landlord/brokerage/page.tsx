import { PlaceholderScreen } from "@/features/shell/PlaceholderScreen";

/** `/landlord/brokerage` — 탭 목적지 자리표. T3.6 에서 실제 화면으로 교체한다(T0.5가 경로만 확정). */
export default function Page() {
  return (
    <PlaceholderScreen
      title="중개요청"
      owner="T3.6"
      description="공실 호실로 보낸 중개 요청 목록과 중개인 응답 현황(열람·수락·거절)."
      href="/landlord/brokerage"
    />
  );
}
