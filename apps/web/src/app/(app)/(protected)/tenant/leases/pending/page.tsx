import { redirect } from "next/navigation";
import { PENDING_LEASE_PATH } from "@/features/profiles/pending-lease";

/**
 * `/tenant/leases/pending` — **옛 경로.** T0.4 가 T1.3 플레이스홀더로 깔았던 자리다.
 *
 * task 문서가 지정한 정식 경로는 `/tenant/leases/accept` 라 화면은 그쪽 하나만 두고
 * 여기서는 **리다이렉트만** 한다. 지우지 않고 남기는 이유는 T0.4 가 내려보내던 `redirectTo`
 * 값이 담긴 링크(문서·북마크·이미 발급된 응답)가 404 로 죽지 않게 하기 위해서다.
 * 경로 문자열은 `features/profiles/pending-lease.ts` 한 곳에서만 관리한다.
 */
export default function LegacyPendingLeasesPage() {
  redirect(PENDING_LEASE_PATH);
}
