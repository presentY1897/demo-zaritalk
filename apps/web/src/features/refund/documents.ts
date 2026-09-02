/**
 * 서류 슬롯 정의와 **업로드 제한** (T2.4) — 화면·API 가 같이 쓰는 순수 모듈.
 *
 * `@zari/db` 도 `@vercel/blob` 도 import 하지 않는다(실제 저장은 `storage.ts`).
 * 그래서 제한 규칙 테스트가 네트워크·DB 없이 돈다.
 *
 * ## 업로드 제한과 근거
 *
 * | 제한 | 값 | 왜 |
 * |---|---|---|
 * | 허용 타입 | `application/pdf` · `image/jpeg` · `image/png` · `image/webp` | 계약서·등본은 스캔 PDF 아니면 휴대폰 사진이다. 그 밖(zip·hwp·exe)은 심사자가 열 수 없거나 위험하다 |
 * | 파일당 크기 | **4MB** | Vercel Functions 의 요청 본문 상한이 4.5MB 다. 서버 업로드(`POST /api/uploads`)는 파일이 함수를 통과하므로 그 아래로 잡는다. 더 큰 파일이 필요해지면 클라이언트 업로드(`handleUpload`)로 바꿔야 한다 |
 * | 슬롯당 개수 | 5장 | 등본·계약서는 여러 장으로 스캔되곤 한다 |
 * | 신청당 총 개수 | 12장 | 심사 화면이 감당할 수 있는 양 |
 * | 파일명 | 200자·경로 문자 제거 | `../` 같은 경로 조작을 pathname 에 싣지 않는다 |
 *
 * 확장자와 MIME 타입을 **둘 다** 본다 — 브라우저가 주는 `File.type` 은 신뢰할 수 없고
 * (빈 문자열이거나 `application/octet-stream` 인 경우가 있다) 확장자만 봐도 마찬가지다.
 * 하나라도 허용 목록 밖이면 거부하고, `type` 이 비어 있으면 확장자로 정한다.
 */

/** 서류 슬롯 — 화면의 업로드 칸 하나 */
export type RefundDocumentSlot = "LEASE_CONTRACT" | "RESIDENT_REGISTRATION" | "PAYMENT_PROOF";

export type RefundSlotMeta = {
  label: string;
  description: string;
  /** 제출하려면 반드시 1장 이상 있어야 하는가 */
  required: boolean;
};

export const REFUND_SLOTS: readonly RefundDocumentSlot[] = [
  "LEASE_CONTRACT",
  "RESIDENT_REGISTRATION",
  "PAYMENT_PROOF",
];

export const REFUND_SLOT_META: Record<RefundDocumentSlot, RefundSlotMeta> = {
  LEASE_CONTRACT: {
    label: "임대차계약서",
    description: "임차인·주소·월세·계약기간이 보이는 면. 여러 장이면 나눠 올려도 됩니다.",
    required: true,
  },
  RESIDENT_REGISTRATION: {
    label: "주민등록등본",
    description: "임차 주소로 전입한 사실이 보여야 합니다.",
    required: true,
  },
  PAYMENT_PROOF: {
    label: "월세 이체 증빙",
    description: "선택 — 계좌 이체 내역·현금영수증 등이 있으면 심사가 빨라집니다.",
    required: false,
  },
};

/** 제출에 반드시 필요한 슬롯 */
export const REQUIRED_SLOTS: readonly RefundDocumentSlot[] = REFUND_SLOTS.filter(
  (slot) => REFUND_SLOT_META[slot].required,
);

/** 파일당 최대 크기(바이트) — Vercel Functions 본문 상한 4.5MB 아래로 잡는다 */
export const UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
/** 한 슬롯에 올릴 수 있는 최대 장수 */
export const UPLOAD_MAX_FILES_PER_SLOT = 5;
/** 신청 1건의 총 서류 장수 */
export const UPLOAD_MAX_FILES_TOTAL = 12;
/** 파일명 최대 길이(정규화 후) */
export const UPLOAD_MAX_FILENAME = 200;

/** 허용 타입 — MIME 과 확장자를 짝지어 둔다 */
export const UPLOAD_ALLOWED_TYPES: readonly { contentType: string; extensions: string[] }[] = [
  { contentType: "application/pdf", extensions: ["pdf"] },
  { contentType: "image/jpeg", extensions: ["jpg", "jpeg"] },
  { contentType: "image/png", extensions: ["png"] },
  { contentType: "image/webp", extensions: ["webp"] },
];

/** `accept` 속성·안내 문구용 */
export const UPLOAD_ACCEPT = UPLOAD_ALLOWED_TYPES.map((t) => t.contentType).join(",");
export const UPLOAD_ALLOWED_EXTENSIONS = UPLOAD_ALLOWED_TYPES.flatMap((t) => t.extensions);
export const UPLOAD_LIMIT_HINT = `PDF·JPG·PNG·WEBP, 파일당 ${Math.floor(
  UPLOAD_MAX_BYTES / (1024 * 1024),
)}MB 까지`;

/** `documents` Json 에 남는 서류 메타 1건 */
export type RefundDocumentMeta = {
  /** 업로드 단건 식별자 — 뷰어 경로(`/api/refunds/[id]/documents/[documentId]`)에 쓴다 */
  id: string;
  slot: RefundDocumentSlot;
  /** 사용자가 올린 원본 파일명(정규화 후) */
  name: string;
  contentType: string;
  size: number;
  /** Blob 스토어 안의 경로 — private 이라 이것만으로는 열리지 않는다 */
  pathname: string;
  /** Blob 이 돌려준 URL(private). 서버가 `get()` 으로 읽을 때 쓴다 */
  url: string;
  uploadedAt: string;
  /** 최초 제출용인지, 보완요청을 받고 올린 것인지 */
  stage: "INITIAL" | "SUPPLEMENT";
};

export type UploadRejectCode =
  | "TYPE_NOT_ALLOWED"
  | "TOO_LARGE"
  | "EMPTY_FILE"
  | "TOO_MANY_FILES"
  | "INVALID_NAME";

export type UploadValidation =
  | { ok: true; name: string; contentType: string; extension: string }
  | { ok: false; code: UploadRejectCode; message: string };

/** 경로 조작·제어문자를 걷어낸 파일명. 확장자는 그대로 둔다. */
export function sanitizeFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "";
  // 제어문자와 파일 시스템 예약문자를 걷어낸다(`..` 는 경로 분리에서 이미 사라진다)
  const cleaned = base.replace(/[\u0000-\u001f<>:"|?*]/g, "").trim();
  return cleaned.slice(0, UPLOAD_MAX_FILENAME);
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return "";
  return name.slice(dot + 1).toLowerCase();
}

/**
 * 업로드 파일 1건 검증 — **타입·크기·이름**.
 *
 * `contentType` 이 비었거나 `application/octet-stream` 이면 확장자로 정한다(브라우저·OS 마다
 * 값이 달라서다). 둘 다 허용 목록 밖이면 거부한다.
 */
export function validateUploadFile(file: {
  name: string;
  size: number;
  type?: string | null;
}): UploadValidation {
  const name = sanitizeFileName(file.name);
  if (!name) return { ok: false, code: "INVALID_NAME", message: "파일 이름이 올바르지 않습니다." };

  const extension = extensionOf(name);
  const byExtension = UPLOAD_ALLOWED_TYPES.find((t) => t.extensions.includes(extension));

  const declared = (file.type ?? "").toLowerCase().split(";")[0]?.trim() ?? "";
  const byType = UPLOAD_ALLOWED_TYPES.find((t) => t.contentType === declared);

  // 확장자가 목록 밖이면(=심사자가 못 여는 파일) 타입이 뭐라 하든 거부한다
  if (!byExtension || (declared && !byType)) {
    return {
      ok: false,
      code: "TYPE_NOT_ALLOWED",
      message: `${UPLOAD_ALLOWED_EXTENSIONS.join("·")} 파일만 올릴 수 있습니다.`,
    };
  }
  if (byType && byExtension && byType.contentType !== byExtension.contentType) {
    return {
      ok: false,
      code: "TYPE_NOT_ALLOWED",
      message: "파일 확장자와 형식이 서로 다릅니다.",
    };
  }

  if (file.size <= 0) {
    return { ok: false, code: "EMPTY_FILE", message: "빈 파일은 올릴 수 없습니다." };
  }
  if (file.size > UPLOAD_MAX_BYTES) {
    return {
      ok: false,
      code: "TOO_LARGE",
      message: `파일당 ${Math.floor(UPLOAD_MAX_BYTES / (1024 * 1024))}MB 까지 올릴 수 있습니다.`,
    };
  }

  return { ok: true, name, contentType: byExtension.contentType, extension };
}

/** 개수 제한 — 이미 올라간 목록에 1장을 더 올릴 수 있는가 */
export function validateUploadCount(
  existing: readonly RefundDocumentMeta[],
  slot: RefundDocumentSlot,
): UploadValidation | null {
  if (existing.length >= UPLOAD_MAX_FILES_TOTAL) {
    return {
      ok: false,
      code: "TOO_MANY_FILES",
      message: `한 신청에 서류는 ${UPLOAD_MAX_FILES_TOTAL}장까지 올릴 수 있습니다.`,
    };
  }
  if (existing.filter((doc) => doc.slot === slot).length >= UPLOAD_MAX_FILES_PER_SLOT) {
    return {
      ok: false,
      code: "TOO_MANY_FILES",
      message: `「${REFUND_SLOT_META[slot].label}」는 ${UPLOAD_MAX_FILES_PER_SLOT}장까지 올릴 수 있습니다.`,
    };
  }
  return null;
}

/** 제출을 막는 부족한 필수 슬롯 */
export function missingRequiredSlots(
  documents: readonly RefundDocumentMeta[],
): RefundDocumentSlot[] {
  return REQUIRED_SLOTS.filter((slot) => !documents.some((doc) => doc.slot === slot));
}

/** 필수 서류가 다 찼는가 */
export function hasRequiredDocuments(documents: readonly RefundDocumentMeta[]): boolean {
  return missingRequiredSlots(documents).length === 0;
}

/** 부족 서류 안내 문구 — API 400 메시지와 화면이 같은 문구를 쓴다 */
export function missingSlotsMessage(slots: readonly RefundDocumentSlot[]): string {
  const labels = slots.map((slot) => REFUND_SLOT_META[slot].label).join("·");
  return `필수 서류가 없습니다: ${labels}`;
}

/** Blob 스토어 안의 경로. 신청 id 로 묶어 두면 심사·삭제 때 한 폴더로 다룰 수 있다. */
export function buildDocumentPathname(
  applicationId: string,
  documentId: string,
  extension: string,
): string {
  return `refunds/${applicationId}/${documentId}.${extension}`;
}
