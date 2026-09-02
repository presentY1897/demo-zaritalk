/**
 * 업로드 제한·서류 슬롯 단위 테스트 (T2.4) — **DB·네트워크 없이** 돈다.
 *
 * 여기서 지키는 것이 곧 `POST /api/uploads` 가 지키는 것이다(같은 함수를 부른다).
 */
import { expect, test } from "vitest";
import {
  buildDocumentPathname,
  hasRequiredDocuments,
  missingRequiredSlots,
  REQUIRED_SLOTS,
  sanitizeFileName,
  UPLOAD_MAX_BYTES,
  UPLOAD_MAX_FILES_PER_SLOT,
  UPLOAD_MAX_FILES_TOTAL,
  validateUploadCount,
  validateUploadFile,
  type RefundDocumentMeta,
  type RefundDocumentSlot,
} from "./documents";

function meta(slot: RefundDocumentSlot, id = Math.random().toString(36).slice(2)): RefundDocumentMeta {
  return {
    id,
    slot,
    name: `${id}.pdf`,
    contentType: "application/pdf",
    size: 1024,
    pathname: `refunds/app/${id}.pdf`,
    url: `memory://x/${id}.pdf`,
    uploadedAt: new Date().toISOString(),
    stage: "INITIAL",
  };
}

test("허용 타입 — pdf·jpg·jpeg·png·webp 는 통과한다", () => {
  const cases: [string, string][] = [
    ["계약서.pdf", "application/pdf"],
    ["등본.jpg", "image/jpeg"],
    ["등본.jpeg", "image/jpeg"],
    ["영수증.png", "image/png"],
    ["영수증.webp", "image/webp"],
  ];
  for (const [name, type] of cases) {
    const result = validateUploadFile({ name, size: 1024, type });
    expect(result.ok, `${name} 은 허용`).toBe(true);
  }
});

test("허용하지 않는 타입은 거부한다 (hwp·zip·exe·확장자 없음)", () => {
  for (const name of ["계약서.hwp", "서류.zip", "악성.exe", "확장자없음"]) {
    const result = validateUploadFile({ name, size: 1024, type: "application/octet-stream" });
    expect(result.ok, `${name} 은 거부`).toBe(false);
    if (!result.ok) expect(result.code).toBe("TYPE_NOT_ALLOWED");
  }
});

test("확장자는 pdf 인데 MIME 이 다르면 거부한다 (이름만 바꿔 올리는 경우)", () => {
  const result = validateUploadFile({ name: "계약서.pdf", size: 1024, type: "image/png" });
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.code).toBe("TYPE_NOT_ALLOWED");
});

test("MIME 이 비어 있으면 확장자로 정한다 (일부 브라우저·OS)", () => {
  const result = validateUploadFile({ name: "계약서.PDF", size: 1024, type: "" });
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.contentType).toBe("application/pdf");
});

test("크기 제한 — 4MB 정확히는 통과, 1바이트 더는 거부", () => {
  const ok = validateUploadFile({
    name: "계약서.pdf",
    size: UPLOAD_MAX_BYTES,
    type: "application/pdf",
  });
  expect(ok.ok).toBe(true);

  const tooBig = validateUploadFile({
    name: "계약서.pdf",
    size: UPLOAD_MAX_BYTES + 1,
    type: "application/pdf",
  });
  expect(tooBig.ok).toBe(false);
  if (!tooBig.ok) expect(tooBig.code).toBe("TOO_LARGE");
});

test("빈 파일은 거부한다", () => {
  const result = validateUploadFile({ name: "계약서.pdf", size: 0, type: "application/pdf" });
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.code).toBe("EMPTY_FILE");
});

test("파일명 — 경로·제어문자를 걷어내고 이름만 남긴다", () => {
  expect(sanitizeFileName("../../etc/passwd.pdf")).toBe("passwd.pdf");
  expect(sanitizeFileName("C:\\temp\\등본.png")).toBe("등본.png");
  expect(sanitizeFileName("계약서<>:*?.pdf")).toBe("계약서.pdf");
  expect(sanitizeFileName("   ")).toBe("");
});

test("이름이 비면 거부한다", () => {
  const result = validateUploadFile({ name: "///", size: 10, type: "application/pdf" });
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.code).toBe("INVALID_NAME");
});

test("장수 제한 — 슬롯당 5장까지", () => {
  const existing = Array.from({ length: UPLOAD_MAX_FILES_PER_SLOT }, () =>
    meta("LEASE_CONTRACT"),
  );
  const rejected = validateUploadCount(existing, "LEASE_CONTRACT");
  expect(rejected?.ok).toBe(false);
  if (rejected && !rejected.ok) expect(rejected.code).toBe("TOO_MANY_FILES");

  // 다른 슬롯은 아직 비어 있으니 통과한다
  expect(validateUploadCount(existing, "RESIDENT_REGISTRATION")).toBeNull();
});

test("장수 제한 — 신청당 12장까지", () => {
  const existing = Array.from({ length: UPLOAD_MAX_FILES_TOTAL }, (_, index) =>
    meta(index % 2 === 0 ? "LEASE_CONTRACT" : "PAYMENT_PROOF"),
  );
  const rejected = validateUploadCount(existing, "RESIDENT_REGISTRATION");
  expect(rejected?.ok).toBe(false);
});

test("필수 서류 — 계약서·등본 둘 다 있어야 한다", () => {
  expect(REQUIRED_SLOTS).toEqual(["LEASE_CONTRACT", "RESIDENT_REGISTRATION"]);

  expect(missingRequiredSlots([])).toEqual(["LEASE_CONTRACT", "RESIDENT_REGISTRATION"]);
  expect(missingRequiredSlots([meta("LEASE_CONTRACT")])).toEqual(["RESIDENT_REGISTRATION"]);
  expect(
    missingRequiredSlots([meta("LEASE_CONTRACT"), meta("RESIDENT_REGISTRATION")]),
  ).toEqual([]);

  // 선택 슬롯만 채워도 필수는 여전히 비어 있다
  expect(hasRequiredDocuments([meta("PAYMENT_PROOF")])).toBe(false);
  expect(hasRequiredDocuments([meta("LEASE_CONTRACT"), meta("RESIDENT_REGISTRATION")])).toBe(true);
});

test("Blob 경로 — 신청 id 로 묶고 문서 id 로 유일해진다", () => {
  expect(buildDocumentPathname("app1", "doc1", "pdf")).toBe("refunds/app1/doc1.pdf");
});
