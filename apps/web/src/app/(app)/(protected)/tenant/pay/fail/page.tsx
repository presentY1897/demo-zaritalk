import type { Metadata } from "next";
import { PayFailView } from "@/features/pay/PayFailView";
import { findChargeIdByOrderId } from "@/features/pay/queries";
import { requireUser } from "@/features/shell/session";
import { findTenantProfile } from "@/features/tenant/ownership";
import { TenantOnly } from "@/features/tenant/TenantOnly";

/**
 * `/tenant/pay/fail` — 토스 위젯이 돌려보내는 실패 콜백 (T2.2).
 *
 * 쿼리: `?code=..&message=..&orderId=..` (SDK v2 Redirect 방식).
 * 상태를 바꾸지 않는다 — 사용자가 결제창을 닫은 것일 수도 있고, GET 요청이 원장을 건드리면 안 된다.
 */
export const metadata: Metadata = { title: "결제 실패 — 자리 데모" };

type Search = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function PayFailPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const user = await requireUser();
  const profile = findTenantProfile(user);
  if (!profile) return <TenantOnly title="결제 실패" />;

  const query = await searchParams;
  const orderId = first(query.orderId);
  const chargeId = orderId ? await findChargeIdByOrderId(orderId, profile.id) : null;

  return <PayFailView code={first(query.code)} message={first(query.message)} chargeId={chargeId} />;
}
