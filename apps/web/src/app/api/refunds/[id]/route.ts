/**
 * `GET·PATCH /api/refunds/[id]` — 환급 신청 상세·수정 (T2.4·T2.5).
 *
 * - `GET` 은 **낸 세입자 또는 어드민**이 본다(`requireApplicationAccess`). 어드민 심사 화면의
 *   상세도 이 엔드포인트를 쓴다 — 세입자가 보는 것과 같은 숫자를 봐야 하기 때문이다.
 * - `PATCH` 는 **DRAFT 일 때만** 받는다. 제출한 뒤에는 내용이 굳는다(심사자가 본 숫자가
 *   조용히 바뀌면 안 된다). DRAFT 가 아니면 **409 `CONFLICT`**.
 *
 * | 실패 | status · code |
 * |---|---|
 * | 비로그인 | 401 `UNAUTHORIZED` |
 * | 세입자 프로필 없음 | 403 `FORBIDDEN` |
 * | 없는 신청 | 404 `NOT_FOUND` |
 * | 남의 신청 | 403 `FORBIDDEN` |
 * | **DRAFT 가 아닌 신청 수정** | 409 `CONFLICT` |
 * | 금액·날짜 형식·없는 날짜·미래 시작일 | 400 `VALIDATION_ERROR` |
 * | `leaseId` 가 내 계약이 아님 | 403 `FORBIDDEN` · 없는 계약 404 |
 *
 * `params` 는 Next 16 규약대로 Promise 다.
 */
import { prisma } from "@zari/db";
import { parseDateOnly } from "@/features/lease/rules";
import { isFutureStart } from "@/features/refund/calc";
import {
  REFUND_APPLICATION_INCLUDE,
  requireApplicationAccess,
  requireOwnApplication,
} from "@/features/refund/ownership";
import { readDocuments, toApplicationDto, toReviewItemDto } from "@/features/refund/queries";
import { updateRefundApplicationSchema } from "@/features/refund/schema";
import { buildApplicationWrite } from "@/features/refund/service";
import { isEditableStatus, type RefundStatusValue } from "@/features/refund/status";
import { fail, ok, parseJson } from "@/lib/api/response";
import { kstToday } from "@/lib/rent";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;

  const access = await requireApplicationAccess(request, id);
  if (access.response) return access.response;

  const { viewer, application } = access.data;
  return ok({
    application:
      viewer.kind === "ADMIN" ? toReviewItemDto(application) : toApplicationDto(application),
  });
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;

  const owned = await requireOwnApplication(id);
  if (owned.response) return owned.response;
  const { application } = owned.data;

  const status = application.status as RefundStatusValue;
  if (!isEditableStatus(status)) {
    return fail("CONFLICT", "제출한 신청은 수정할 수 없습니다. 심사 결과를 기다려 주세요.");
  }

  const parsed = await parseJson(request, updateRefundApplicationSchema);
  if (parsed.response) return parsed.response;
  const input = parsed.data;

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
    if (lease.tenantProfileId !== owned.data.tenant.profile.id) {
      return fail("FORBIDDEN", "내 계약이 아닙니다.");
    }
  }

  // 이미 올린 서류는 그대로 두고 계산 입력만 갈아 끼운다
  const files = readDocuments(application.documents);

  // 전이 전 상태를 조건에 넣은 단일 UPDATE — 제출과 수정이 겹쳐도 한쪽만 성공한다
  const updated = await prisma.refundApplication.updateMany({
    where: { id, status: "DRAFT" },
    data: buildApplicationWrite(input, asOf, files),
  });
  if (updated.count === 0) {
    return fail("CONFLICT", "제출한 신청은 수정할 수 없습니다. 심사 결과를 기다려 주세요.");
  }

  const row = await prisma.refundApplication.findUnique({
    where: { id },
    include: REFUND_APPLICATION_INCLUDE,
  });
  if (!row) return fail("INTERNAL_ERROR", "신청을 저장하지 못했습니다.");
  return ok({ application: toApplicationDto(row) });
}
