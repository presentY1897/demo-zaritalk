import type { Metadata } from "next";
import {
  getLeaseOptions,
  getMyApplications,
} from "@/features/refund/queries";
import { RefundStatusView } from "@/features/refund/RefundStatusView";
import { requireUser } from "@/features/shell/session";
import { findTenantProfile } from "@/features/tenant/ownership";
import { TenantOnly } from "@/features/tenant/TenantOnly";

/**
 * `/tenant/refund` — 세입자 탭바의 「환급」(경로는 T0.5 에서 확정) (T2.4).
 *
 * 상태 스테퍼(제출→심사중→승인/반려→완료)·심사 코멘트·보완 서류 추가 업로드.
 * 서버가 목록을 읽어 넘기고, 이후 갱신은 Tanstack Query 가 맡는다 —
 * `GET /api/refunds` 와 **같은 함수**(`features/refund/queries.ts`)라 모양이 어긋나지 않는다.
 */
export const metadata: Metadata = { title: "환급 — 자리 데모" };

export default async function TenantRefundPage() {
  const user = await requireUser();
  const profile = findTenantProfile(user);
  if (!profile) return <TenantOnly title="환급" />;

  const [applications, leases] = await Promise.all([
    getMyApplications(profile.id),
    getLeaseOptions(profile.id),
  ]);

  return <RefundStatusView initial={{ applications, leases }} />;
}
