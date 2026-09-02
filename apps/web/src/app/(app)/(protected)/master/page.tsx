import type { Metadata } from "next";
import { MasterHomeView } from "@/features/master/MasterHomeView";
import { requireMaster } from "@/features/master/ownership";
import { isProActive } from "@/features/master/plan";
import { listMasterFeed, listMasterTargets, toMasterPlanDto } from "@/features/master/queries";
import { MasterOnly } from "@/features/master/MasterOnly";
import type { MasterPlanValue } from "@/features/workorder/types";

/**
 * `/master` — 마스터 홈(의뢰 피드) (T5.2). T0.5 가 배정한 탭 목적지의 플레이스홀더를 대체한다.
 *
 * 라우트 핸들러(`GET /api/master/feed`·`/targets`)와 **같은 조회 함수**로 두 탭의 첫 데이터를
 * 함께 그린다 — 탭을 바꿀 때 네트워크 왕복이 없다.
 */
export const metadata: Metadata = { title: "의뢰 피드 — 자리 데모" };

export default async function MasterHomePage() {
  const master = await requireMaster();
  // 화면은 API 처럼 403 을 던질 수 없으므로 안내 화면으로 바꿔 준다
  if (master.response) return <MasterOnly />;

  const { detail } = master.data;
  const [workOrders, targets] = await Promise.all([
    listMasterFeed(detail),
    listMasterTargets(detail),
  ]);
  const plan = toMasterPlanDto(detail);

  return (
    <MasterHomeView
      initialFeed={{ workOrders, master: plan }}
      initialTargets={{
        workOrders: targets,
        master: plan,
        upgradeRequired: !isProActive(detail.plan as MasterPlanValue, detail.planUntil),
      }}
    />
  );
}
