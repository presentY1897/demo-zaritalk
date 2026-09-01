import { PlaceholderScreen } from "@/features/shell/PlaceholderScreen";

/** `/tenant/refund` — 탭 목적지 자리표. T2.4 에서 실제 화면으로 교체한다(T0.5가 경로만 확정). */
export default function Page() {
  return (
    <PlaceholderScreen
      title="환급"
      owner="T2.4"
      description="월세 세액공제 신청 상태 스테퍼(제출→심사중→승인)와 보완 서류 업로드."
      href="/tenant/refund"
    />
  );
}
