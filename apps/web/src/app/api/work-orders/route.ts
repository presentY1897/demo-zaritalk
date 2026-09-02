/**
 * `GET·POST /api/work-orders` — 임대인 작업 의뢰 목록·생성 (T5.1).
 *
 * ## `POST` — 생성하면 **그 자리에서 추천이 나간다**
 * 저장 직후 `dispatchWorkOrderTargets` 가 업종·반경·유료(PRO) 조건을 만족하는 마스터를
 * 거리순 최대 10명 골라 `WorkOrderTarget` + 발송 로그를 만든다
 * ([D4](../../../../../../docs/DECISIONS.md#-d4-마스터-매칭-방식--pull--push-하이브리드)).
 * 민원 전환(`POST /api/complaints/[id]/convert`)도 **같은 함수**를 부른다 — 발송 규칙은 한 곳뿐이다.
 *
 * 추천 발송이 실패해도 의뢰 자체는 남긴다(같은 트랜잭션에 묶지 않는다) —
 * 추천은 부가 기능이고, 발송이 안 됐어도 마스터는 **전체 피드(pull)** 로 그 의뢰를 볼 수 있다.
 *
 * | 실패 | status · code |
 * |---|---|
 * | 비로그인 | 401 `UNAUTHORIZED` |
 * | 임대인 프로필 없음 | 403 `FORBIDDEN` |
 * | 없는 건물·호실 | 404 `NOT_FOUND` |
 * | 남의 건물·호실 | 403 `FORBIDDEN` |
 * | 호실이 그 건물 소속이 아님·형식 오류 | 400 `VALIDATION_ERROR` |
 */
import { prisma } from "@zari/db";
import { parseDateOnly } from "@/features/lease/rules";
import {
  requireLandlord,
  requireOwnedBuilding,
  requireOwnedUnit,
} from "@/features/landlord/ownership";
import { dispatchWorkOrderTargets } from "@/features/workorder/matching";
import {
  getLandlordWorkOrder,
  listLandlordWorkOrders,
  listWorkOrderPlaceOptions,
} from "@/features/workorder/queries";
import { createWorkOrderSchema } from "@/features/workorder/schema";
import { created, fail, ok, parseJson } from "@/lib/api/response";

export async function GET(): Promise<Response> {
  const landlord = await requireLandlord();
  if (landlord.response) return landlord.response;

  const [workOrders, places] = await Promise.all([
    listLandlordWorkOrders(landlord.data.profile.id),
    listWorkOrderPlaceOptions(landlord.data.profile.id),
  ]);
  return ok({ workOrders, places });
}

export async function POST(request: Request): Promise<Response> {
  const landlord = await requireLandlord();
  if (landlord.response) return landlord.response;

  const parsed = await parseJson(request, createWorkOrderSchema);
  if (parsed.response) return parsed.response;
  const input = parsed.data;

  const building = await requireOwnedBuilding(landlord.data, input.buildingId);
  if (building.response) return building.response;

  if (input.unitId) {
    const unit = await requireOwnedUnit(landlord.data, input.unitId);
    if (unit.response) return unit.response;
    if (unit.data.buildingId !== building.data.id) {
      return fail("VALIDATION_ERROR", "선택한 호실이 그 건물의 호실이 아닙니다.");
    }
  }

  let desiredDate: Date | null = null;
  if (input.desiredDate) {
    desiredDate = parseDateOnly(input.desiredDate);
    if (!desiredDate) return fail("VALIDATION_ERROR", "희망일이 올바른 날짜가 아닙니다.");
  }

  const row = await prisma.workOrder.create({
    data: {
      requesterProfileId: landlord.data.profile.id,
      buildingId: building.data.id,
      unitId: input.unitId ?? null,
      category: input.category,
      description: input.description,
      desiredDate,
      // status 는 스키마 기본값 REQUESTED — 마스터 피드(pull)가 이 상태만 본다
    },
  });

  const dispatchedCount = await dispatchWorkOrderTargets(row.id);

  const workOrder = await getLandlordWorkOrder(row.id);
  if (!workOrder) return fail("INTERNAL_ERROR", "작업 의뢰를 저장하지 못했습니다.");
  return created({ workOrder, dispatchedCount });
}
