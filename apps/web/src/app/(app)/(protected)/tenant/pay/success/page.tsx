import type { Metadata } from "next";
import { PaySuccessView } from "@/features/pay/PaySuccessView";
import { findChargeIdByOrderId } from "@/features/pay/queries";
import { requireUser } from "@/features/shell/session";
import { findTenantProfile } from "@/features/tenant/ownership";
import { TenantOnly } from "@/features/tenant/TenantOnly";

/**
 * `/tenant/pay/success` — 토스 위젯이 돌려보내는 성공 콜백 (T2.2).
 *
 * 쿼리: `?paymentType=NORMAL&amount=..&orderId=..&paymentKey=..` (SDK v2 Redirect 방식).
 * **여기 도착했다고 결제가 끝난 게 아니다** — 클라이언트가 `POST /api/toss/confirm` 을 불러야
 * 승인이 완료된다. 서버는 재시도 링크에 쓸 청구 id 만 미리 찾아 준다.
 *
 * Next 16 이라 `searchParams` 는 Promise 다.
 */
export const metadata: Metadata = { title: "결제 완료 — 자리 데모" };

type Search = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function PaySuccessPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const user = await requireUser();
  const profile = findTenantProfile(user);
  if (!profile) return <TenantOnly title="결제 완료" />;

  const query = await searchParams;
  const orderId = first(query.orderId);
  const chargeId = orderId ? await findChargeIdByOrderId(orderId, profile.id) : null;

  return (
    <PaySuccessView
      params={{
        paymentKey: first(query.paymentKey),
        orderId,
        amount: first(query.amount),
      }}
      chargeId={chargeId}
    />
  );
}
