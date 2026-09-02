import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PayCheckoutView } from "@/features/pay/PayCheckoutView";
import { getPayCheckoutView } from "@/features/pay/queries";
import { requireUser } from "@/features/shell/session";
import { findTenantProfile } from "@/features/tenant/ownership";
import { TenantOnly } from "@/features/tenant/TenantOnly";

/**
 * `/tenant/pay/[chargeId]` — 청구 확인 + 토스 결제위젯 (T2.2).
 *
 * 서버가 청구·계약을 읽어 **결제 금액(청구 잔액)까지 확정한 DTO** 를 내려주고, 클라이언트는
 * 그대로 그린다. 실제 결제 금액은 결제 직전 `POST /api/toss/checkout` 이 한 번 더 확정한다.
 *
 * Next 16 이라 `params` 는 Promise 다.
 */
export const metadata: Metadata = {
  title: "자리페이 결제 — 자리 데모",
  description: "월세 청구를 카드로 결제합니다.",
};

export default async function PayCheckoutPage({
  params,
}: {
  params: Promise<{ chargeId: string }>;
}) {
  const user = await requireUser();
  const profile = findTenantProfile(user);
  if (!profile) return <TenantOnly title="자리페이 결제" />;

  const { chargeId } = await params;
  const data = await getPayCheckoutView(chargeId, profile.id, user.name);
  // 없는 청구와 남의 청구를 화면에서는 구분하지 않는다(API 는 404/403 을 구분한다)
  if (!data) notFound();

  return <PayCheckoutView data={data} />;
}
