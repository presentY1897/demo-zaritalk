import type { Metadata } from "next";
import { getLeaseOptions, getMyDraft } from "@/features/refund/queries";
import { RefundApplyView, type RefundApplyPrefill } from "@/features/refund/RefundApplyView";
import { defaultRefundPeriod } from "@/features/refund/calc";
import { requireUser } from "@/features/shell/session";
import { findTenantProfile } from "@/features/tenant/ownership";
import { TenantOnly } from "@/features/tenant/TenantOnly";
import { kstToday } from "@/lib/rent";

/**
 * `/tenant/refund/apply` — 환급 신청서 (T2.4).
 *
 * 계산기(T2.3) CTA 가 계산 입력을 쿼리로 실어 보낸다
 * (`?grossSalary=…&monthlyRent=…&startDate=…&endDate=…`) — **그 값으로 폼을 미리 채운다.**
 * 같은 값이 같은 계산 함수로 들어가므로 계산기가 보여 준 금액이 그대로 재현된다.
 *
 * 기본 기간은 서버에서 만든다 — 클라이언트가 `new Date()` 로 만들면 하이드레이션이 갈린다
 * (계산기 화면이 같은 이유로 서버에서 기본값을 내려보낸다).
 *
 * `searchParams` 는 Next 16 규약대로 Promise 다.
 */
export const metadata: Metadata = { title: "환급 신청 — 자리 데모" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function RefundApplyPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requireUser();
  const profile = findTenantProfile(user);
  if (!profile) return <TenantOnly title="환급 신청" />;

  const params = await searchParams;
  const period = defaultRefundPeriod(kstToday());
  const prefill: RefundApplyPrefill = {
    grossSalary: first(params.grossSalary),
    monthlyRent: first(params.monthlyRent),
    startDate: first(params.startDate) || period.startDate,
    endDate: first(params.endDate) || period.endDate,
  };

  const [draft, leases] = await Promise.all([getMyDraft(profile.id), getLeaseOptions(profile.id)]);

  return <RefundApplyView draft={draft} leases={leases} prefill={prefill} />;
}
