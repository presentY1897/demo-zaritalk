/**
 * `GET·POST /api/refunds` — 환급 신청 목록·생성 (T2.4·T2.5).
 *
 * 민원(T2.6)의 `?role=` 과 같은 방식으로 **시점을 쿼리로 고른다**:
 *
 * | 쿼리 | 누가 | 응답 |
 * |---|---|---|
 * | (기본) `?scope=mine` | 세입자 | `{ applications, leases }` — 내 신청 + 자동 채움용 내 계약 |
 * | `?scope=review&status=SUBMITTED,REVIEWING` | **어드민** | `{ applications, counts }` — 심사 큐 |
 *
 * `POST` 는 언제나 **DRAFT** 를 만든다. 제출은 `POST /api/refunds/[id]/submit` 이 따로 한다 —
 * 신청서에 서류를 붙이려면 신청 id 가 먼저 있어야 하기 때문이다(임시저장 → 업로드 → 제출).
 *
 * | 실패 | status · code |
 * |---|---|
 * | 비로그인 | 401 `UNAUTHORIZED` |
 * | 세입자 프로필 없음 | 403 `FORBIDDEN` |
 * | 어드민 큐를 비어드민이 호출 | 403 `FORBIDDEN` |
 * | 금액·날짜 형식, 기간 역전, 없는 날짜, **미래 시작일** | 400 `VALIDATION_ERROR` |
 * | `leaseId` 가 내 계약이 아님 | 403 `FORBIDDEN` / 없는 계약 404 `NOT_FOUND` |
 * | 이미 작성 중인 신청(DRAFT)이 있음 | 409 `CONFLICT` |
 */
import { prisma } from "@zari/db";
import { parseDateOnly } from "@/features/lease/rules";
import { isFutureStart } from "@/features/refund/calc";
import { REFUND_APPLICATION_INCLUDE, requireRefundAdmin } from "@/features/refund/ownership";
import {
  getLeaseOptions,
  getMyApplications,
  getReviewQueue,
  getStatusCounts,
  toApplicationDto,
} from "@/features/refund/queries";
import { createRefundApplicationSchema, refundListQuerySchema } from "@/features/refund/schema";
import { buildApplicationWrite } from "@/features/refund/service";
import {
  REFUND_QUEUE_STATUSES,
  REFUND_STATUS_ORDER,
  type RefundStatusValue,
} from "@/features/refund/status";
import { requireTenant } from "@/features/tenant/ownership";
import { created, fail, ok, parseJson, parseQuery } from "@/lib/api/response";
import { kstToday } from "@/lib/rent";

/** `?status=SUBMITTED,REVIEWING` → 상태 배열. 모르는 값은 버린다(빈 필터면 기본 큐). */
function parseStatusFilter(raw: string | undefined): RefundStatusValue[] {
  if (!raw) return [...REFUND_QUEUE_STATUSES];
  const wanted = raw
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value): value is RefundStatusValue =>
      (REFUND_STATUS_ORDER as readonly string[]).includes(value),
    );
  return wanted.length > 0 ? wanted : [...REFUND_QUEUE_STATUSES];
}

export async function GET(request: Request): Promise<Response> {
  const query = parseQuery(request, refundListQuerySchema);
  if (query.response) return query.response;

  if (query.data.scope === "review") {
    const admin = await requireRefundAdmin(request);
    if (admin.response) return admin.response;

    const [applications, counts] = await Promise.all([
      getReviewQueue(parseStatusFilter(query.data.status)),
      getStatusCounts(),
    ]);
    return ok({ applications, counts });
  }

  const tenant = await requireTenant();
  if (tenant.response) return tenant.response;

  const [applications, leases] = await Promise.all([
    getMyApplications(tenant.data.profile.id),
    getLeaseOptions(tenant.data.profile.id),
  ]);
  return ok({ applications, leases });
}

export async function POST(request: Request): Promise<Response> {
  const tenant = await requireTenant();
  if (tenant.response) return tenant.response;

  const parsed = await parseJson(request, createRefundApplicationSchema);
  if (parsed.response) return parsed.response;
  const input = parsed.data;

  // 계산기(T2.3)와 **같은 순서로** 막는다 — 형식·기간은 스키마가, 나머지는 여기서
  if (!parseDateOnly(input.startDate) || !parseDateOnly(input.endDate)) {
    return fail("VALIDATION_ERROR", "존재하지 않는 날짜입니다.");
  }
  const asOf = kstToday();
  if (isFutureStart(input.startDate, asOf)) {
    return fail("VALIDATION_ERROR", "임차 시작일이 오늘보다 미래입니다. 날짜를 확인해 주세요.");
  }

  if (input.leaseId) {
    const lease = await prisma.lease.findUnique({ where: { id: input.leaseId } });
    if (!lease) return fail("NOT_FOUND", "계약을 찾을 수 없습니다.");
    if (lease.tenantProfileId !== tenant.data.profile.id) {
      return fail("FORBIDDEN", "내 계약이 아닙니다.");
    }
  }

  // 작성 중인 신청은 하나만 — 화면은 진입할 때 기존 DRAFT 를 불러 이어서 쓴다
  const draft = await prisma.refundApplication.findFirst({
    where: { tenantProfileId: tenant.data.profile.id, status: "DRAFT" },
  });
  if (draft) {
    return fail("CONFLICT", "이미 작성 중인 환급 신청이 있습니다. 이어서 작성해 주세요.");
  }

  const row = await prisma.refundApplication.create({
    data: {
      tenantProfileId: tenant.data.profile.id,
      status: "DRAFT",
      ...buildApplicationWrite(input, asOf, []),
    },
    include: REFUND_APPLICATION_INCLUDE,
  });

  return created({ application: toApplicationDto(row) });
}
