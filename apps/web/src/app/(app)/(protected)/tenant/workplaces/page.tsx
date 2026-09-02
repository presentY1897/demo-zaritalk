import type { Metadata } from "next";
import { TenantOnly } from "@/features/tenant/TenantOnly";
import { findTenantProfile } from "@/features/tenant/ownership";
import { requireUser } from "@/features/shell/session";
import { WorkplaceListView } from "@/features/workplace/WorkplaceListView";
import { listWorkplaces } from "@/features/workplace/queries";

/**
 * `/tenant/workplaces` — 근무지 관리 (T3.4).
 *
 * 세입자 프로필이 없는 계정은 T1.3 의 빈 상태(`TenantOnly`)를 그대로 쓴다.
 * 첫 데이터는 API 와 **같은 함수**(`listWorkplaces`)로 읽어 `initialData` 로 넘긴다.
 */
export const metadata: Metadata = { title: "근무지 — 자리 데모" };

export default async function WorkplacesPage() {
  const user = await requireUser();
  const profile = findTenantProfile(user);
  if (!profile) return <TenantOnly title="근무지" />;

  const workplaces = await listWorkplaces(profile.id);
  return <WorkplaceListView initialWorkplaces={workplaces} />;
}
