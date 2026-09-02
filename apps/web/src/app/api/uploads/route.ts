/**
 * `POST /api/uploads` — 서류 업로드 (T2.4).
 *
 * `multipart/form-data` 로 **파일 1개**를 받아 Vercel Blob **private 스토어**에 올리고,
 * 메타를 `RefundApplication.documents`(Json)에 기록한다.
 *
 * ```
 * file           (File)   업로드할 파일
 * applicationId  (string) 어느 신청에 붙일 것인가
 * slot           (string) LEASE_CONTRACT | RESIDENT_REGISTRATION | PAYMENT_PROOF
 * ```
 *
 * ## 왜 신청 id 를 함께 받나
 *
 * 올린 파일이 **어디에도 매달리지 않은 채** 스토어에 남는 것을 막기 위해서다. 업로드와
 * 메타 기록이 한 요청 안에서 끝나므로, 권한 판정(내 신청인가)도 업로드 **전에** 한 번에 끝난다.
 * 그래서 신청서 화면은 "임시저장(DRAFT 생성) → 업로드" 순서로 동작한다.
 *
 * ## 제한 (`features/refund/documents.ts` 가 단일 출처)
 *
 * PDF·JPG·PNG·WEBP / 파일당 4MB / 슬롯당 5장 / 신청당 12장.
 * 4MB 는 Vercel Functions 요청 본문 상한(4.5MB) 아래로 잡은 값이다.
 *
 * | 실패 | status · code |
 * |---|---|
 * | 비로그인 | 401 `UNAUTHORIZED` |
 * | 세입자 프로필 없음 | 403 `FORBIDDEN` |
 * | 없는 신청 | 404 `NOT_FOUND` · 남의 신청 403 `FORBIDDEN` |
 * | multipart 아님·파일 없음·모르는 슬롯 | 400 `VALIDATION_ERROR` |
 * | **허용하지 않는 타입·4MB 초과·빈 파일·장수 초과** | 400 `VALIDATION_ERROR` (`details.reason`) |
 * | 올릴 수 없는 상태(제출·심사중·종결) | 409 `CONFLICT` |
 *
 * > **민원 사진(T2.6) 연결**: 이 엔드포인트는 환급 신청에 묶여 있다(`applicationId` 필수).
 * > 민원에도 붙이려면 `target=complaint&complaintId=…` 분기와 민원 권한 판정
 * > (`features/complaint/ownership.ts` 의 `requireComplaintAccess`)만 더하면 되고, 저장 계층
 * > (`features/refund/storage.ts`)·제한 규칙은 그대로 쓸 수 있다. 다만 그 두 파일과 접수 시트가
 * > 이번 task 소유가 아니라 손대지 않았다 — 자세한 내용은 `docs/tasks/t2.4-refund-apply.md`.
 */
import { prisma } from "@zari/db";
import {
  buildDocumentPathname,
  validateUploadCount,
  validateUploadFile,
  type RefundDocumentMeta,
} from "@/features/refund/documents";
import { REFUND_APPLICATION_INCLUDE, requireOwnApplication } from "@/features/refund/ownership";
import { readDocuments, toApplicationDto } from "@/features/refund/queries";
import { uploadDocumentFieldsSchema } from "@/features/refund/schema";
import { appendDocument, uploadStageFor } from "@/features/refund/service";
import { isUploadableStatus, type RefundStatusValue } from "@/features/refund/status";
import { putDocument } from "@/features/refund/storage";
import { created, fail } from "@/lib/api/response";

export async function POST(request: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("VALIDATION_ERROR", "multipart/form-data 요청이 아닙니다.");
  }

  const fields = uploadDocumentFieldsSchema.safeParse({
    applicationId: form.get("applicationId"),
    slot: form.get("slot"),
  });
  if (!fields.success) {
    return fail("VALIDATION_ERROR", "요청 값이 올바르지 않습니다.", fields.error.issues);
  }

  const file = form.get("file");
  if (!(file instanceof File)) return fail("VALIDATION_ERROR", "업로드할 파일이 없습니다.");

  const owned = await requireOwnApplication(fields.data.applicationId);
  if (owned.response) return owned.response;
  const { application } = owned.data;

  const status = application.status as RefundStatusValue;
  if (!isUploadableStatus(status)) {
    return fail("CONFLICT", "지금은 서류를 추가할 수 없는 상태입니다.");
  }

  const existing = readDocuments(application.documents);
  const countRejection = validateUploadCount(existing, fields.data.slot);
  if (countRejection && !countRejection.ok) {
    return fail("VALIDATION_ERROR", countRejection.message, { reason: countRejection.code });
  }

  const checked = validateUploadFile({ name: file.name, size: file.size, type: file.type });
  if (!checked.ok) {
    return fail("VALIDATION_ERROR", checked.message, { reason: checked.code });
  }

  const documentId = crypto.randomUUID().replaceAll("-", "");
  const pathname = buildDocumentPathname(application.id, documentId, checked.extension);
  const stored = await putDocument({
    pathname,
    body: await file.arrayBuffer(),
    contentType: checked.contentType,
  });

  const meta: RefundDocumentMeta = {
    id: documentId,
    slot: fields.data.slot,
    name: checked.name,
    contentType: checked.contentType,
    size: file.size,
    pathname: stored.pathname,
    url: stored.url,
    uploadedAt: new Date().toISOString(),
    stage: uploadStageFor(status),
  };

  const row = await prisma.refundApplication.update({
    where: { id: application.id },
    data: { documents: appendDocument(application, meta) },
    include: REFUND_APPLICATION_INCLUDE,
  });

  const dto = toApplicationDto(row);
  const document = dto.documents.find((doc) => doc.id === documentId);
  if (!document) return fail("INTERNAL_ERROR", "서류를 저장하지 못했습니다.");

  return created({ document, application: dto });
}
