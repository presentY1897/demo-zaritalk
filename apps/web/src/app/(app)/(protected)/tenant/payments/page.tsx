import type { Metadata } from "next";
import { PaymentHistoryView } from "@/features/pay/PaymentHistoryView";
import { listTenantPayments } from "@/features/pay/queries";
import { requireUser } from "@/features/shell/session";
import { findTenantProfile } from "@/features/tenant/ownership";
import { TenantOnly } from "@/features/tenant/TenantOnly";

/**
 * `/tenant/payments` — 내 납부 이력(카드/기타 구분) (T2.2).
 *
 * 임대인이 기록한 납부와 세입자가 낸 자리페이 결제가 같은 `RentPayment` 에 쌓이므로
 * 한 목록으로 보여 주고 수단만 배지로 나눈다.
 */
export const metadata: Metadata = {
  title: "납부 내역 — 자리 데모",
  description: "내 계약의 납부 기록을 확인합니다.",
};

export default async function TenantPaymentsPage() {
  const user = await requireUser();
  const profile = findTenantProfile(user);
  if (!profile) return <TenantOnly title="납부 내역" />;

  const data = await listTenantPayments(profile.id);
  return <PaymentHistoryView data={data} />;
}
