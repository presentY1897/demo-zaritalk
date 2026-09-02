/**
 * `POST /api/uploads` 테스트 (T2.4) — 서류 업로드.
 *
 * 최소 테스트 요구 중 **"업로드 타입·크기 제한"** 이 여기 있다(규칙 자체는
 * `features/refund/documents.test.ts` 가 DB 없이 지킨다 — 여기서는 **API 가 그 규칙을 실제로
 * 적용하는지**와 `documents` Json 기록을 본다).
 *
 * Blob 은 타지 않는다: 테스트 DB 를 보고 있으면 저장소가 메모리 드라이버로 떨어진다
 * (`features/refund/storage.ts`).
 */
import { prisma } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import { loginAs } from "@/features/landlord/testing";
import { UPLOAD_MAX_BYTES, UPLOAD_MAX_FILES_PER_SLOT } from "@/features/refund/documents";
import { readDocuments } from "@/features/refund/queries";
import { resolveUploadDriver, resetUploadMemory } from "@/features/refund/storage";
import {
  createApplication,
  createOtherRefundScene,
  createRefundScene,
  fakeFile,
  requiredDocs,
  uploadRequest,
} from "@/features/refund/testing";
import { resetTestCookies } from "@/lib/auth/testing";
import { POST } from "./route";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
  resetUploadMemory();
});

test("테스트 DB 를 보고 있으면 저장소가 메모리 드라이버다 (외부 Blob 을 타지 않는다)", () => {
  expect(resolveUploadDriver()).toBe("memory");
});

test("비로그인 401 · 없는 신청 404 · 남의 신청 403", async () => {
  const scene = await createRefundScene();
  const app = await createApplication(scene);
  const file = () => fakeFile("계약서.pdf", "application/pdf");

  expect(
    (await POST(uploadRequest({ applicationId: app.id, slot: "LEASE_CONTRACT", file: file() })))
      .status,
  ).toBe(401);

  const other = await createOtherRefundScene();
  await loginAs(other.tenant.user.id);
  expect(
    (await POST(uploadRequest({ applicationId: app.id, slot: "LEASE_CONTRACT", file: file() })))
      .status,
  ).toBe(403);
  expect(
    (await POST(uploadRequest({ applicationId: "nope", slot: "LEASE_CONTRACT", file: file() })))
      .status,
  ).toBe(404);
});

test("업로드 성공 — 201 + documents Json 에 메타가 기록된다", async () => {
  const scene = await createRefundScene();
  const app = await createApplication(scene);
  await loginAs(scene.tenant.user.id);

  const response = await POST(
    uploadRequest({
      applicationId: app.id,
      slot: "LEASE_CONTRACT",
      file: fakeFile("임대차계약서.pdf", "application/pdf", 2048),
    }),
  );
  expect(response.status).toBe(201);

  const body = await response.json();
  expect(body.document.slot).toBe("LEASE_CONTRACT");
  expect(body.document.name).toBe("임대차계약서.pdf");
  expect(body.document.size).toBe(2048);
  expect(body.document.stage).toBe("INITIAL");
  expect(body.document.viewHref).toBe(`/api/refunds/${app.id}/documents/${body.document.id}`);
  expect(body.application.missingSlots).toEqual(["RESIDENT_REGISTRATION"]);

  const row = await prisma.refundApplication.findUnique({ where: { id: app.id } });
  const stored = readDocuments(row?.documents);
  expect(stored).toHaveLength(1);
  expect(stored[0]?.pathname).toBe(`refunds/${app.id}/${body.document.id}.pdf`);
  // private 스토어라 URL 은 서버에만 남는다
  expect(stored[0]?.url).toContain("zari-demo-docs");

  // 계산 입력(봉투의 calc)은 업로드로 사라지지 않는다
  expect(row?.expectedAmount).toBe(app.expectedAmount);
});

test("**허용하지 않는 타입은 400** — 파일이 저장되지 않는다", async () => {
  const scene = await createRefundScene();
  const app = await createApplication(scene);
  await loginAs(scene.tenant.user.id);

  const response = await POST(
    uploadRequest({
      applicationId: app.id,
      slot: "LEASE_CONTRACT",
      file: fakeFile("계약서.hwp", "application/x-hwp"),
    }),
  );
  expect(response.status).toBe(400);
  expect((await response.json()).error.details.reason).toBe("TYPE_NOT_ALLOWED");

  const row = await prisma.refundApplication.findUnique({ where: { id: app.id } });
  expect(readDocuments(row?.documents)).toHaveLength(0);
});

test("**크기 제한 초과는 400** — 4MB 정확히는 통과", async () => {
  const scene = await createRefundScene();
  const app = await createApplication(scene);
  await loginAs(scene.tenant.user.id);

  const tooBig = await POST(
    uploadRequest({
      applicationId: app.id,
      slot: "LEASE_CONTRACT",
      file: fakeFile("큰계약서.pdf", "application/pdf", UPLOAD_MAX_BYTES + 1),
    }),
  );
  expect(tooBig.status).toBe(400);
  expect((await tooBig.json()).error.details.reason).toBe("TOO_LARGE");

  const exact = await POST(
    uploadRequest({
      applicationId: app.id,
      slot: "LEASE_CONTRACT",
      file: fakeFile("딱맞는계약서.pdf", "application/pdf", UPLOAD_MAX_BYTES),
    }),
  );
  expect(exact.status).toBe(201);
});

test("빈 파일·파일 없음·모르는 슬롯은 400", async () => {
  const scene = await createRefundScene();
  const app = await createApplication(scene);
  await loginAs(scene.tenant.user.id);

  expect(
    (
      await POST(
        uploadRequest({
          applicationId: app.id,
          slot: "LEASE_CONTRACT",
          file: fakeFile("빈파일.pdf", "application/pdf", 0),
        }),
      )
    ).status,
  ).toBe(400);

  expect((await POST(uploadRequest({ applicationId: app.id, slot: "LEASE_CONTRACT" }))).status).toBe(
    400,
  );

  expect(
    (
      await POST(
        uploadRequest({
          applicationId: app.id,
          slot: "PASSPORT",
          file: fakeFile("여권.pdf", "application/pdf"),
        }),
      )
    ).status,
  ).toBe(400);
});

test("multipart 가 아니면 400", async () => {
  const response = await POST(
    new Request("http://localhost/api/uploads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ applicationId: "x" }),
    }),
  );
  expect(response.status).toBe(400);
});

test("슬롯당 장수 제한을 넘으면 400", async () => {
  const scene = await createRefundScene();
  const app = await createApplication(scene);
  await loginAs(scene.tenant.user.id);

  for (let i = 0; i < UPLOAD_MAX_FILES_PER_SLOT; i += 1) {
    const response = await POST(
      uploadRequest({
        applicationId: app.id,
        slot: "LEASE_CONTRACT",
        file: fakeFile(`계약서${i}.pdf`, "application/pdf"),
      }),
    );
    expect(response.status).toBe(201);
  }

  const overflow = await POST(
    uploadRequest({
      applicationId: app.id,
      slot: "LEASE_CONTRACT",
      file: fakeFile("한장더.pdf", "application/pdf"),
    }),
  );
  expect(overflow.status).toBe(400);
  expect((await overflow.json()).error.details.reason).toBe("TOO_MANY_FILES");
});

test("제출한 뒤에는 올릴 수 없다 (409) — 보완요청을 받으면 다시 열린다", async () => {
  const scene = await createRefundScene();
  await loginAs(scene.tenant.user.id);

  for (const status of ["SUBMITTED", "REVIEWING", "APPROVED", "REJECTED", "COMPLETED"] as const) {
    const app = await createApplication(scene, { status, documents: requiredDocs() });
    const response = await POST(
      uploadRequest({
        applicationId: app.id,
        slot: "PAYMENT_PROOF",
        file: fakeFile("증빙.png", "image/png"),
      }),
    );
    expect(response.status, `${status} 에서는 업로드 불가`).toBe(409);
  }

  const needMore = await createApplication(scene, {
    status: "NEED_MORE_DOCS",
    documents: requiredDocs(),
  });
  const response = await POST(
    uploadRequest({
      applicationId: needMore.id,
      slot: "RESIDENT_REGISTRATION",
      file: fakeFile("등본.png", "image/png"),
    }),
  );
  expect(response.status).toBe(201);
  // 보완요청 뒤에 올린 서류는 SUPPLEMENT 로 표시된다(재제출 검증이 이 값을 본다)
  expect((await response.json()).document.stage).toBe("SUPPLEMENT");
});

test("파일명은 경로를 걷어내고 저장한다", async () => {
  const scene = await createRefundScene();
  const app = await createApplication(scene);
  await loginAs(scene.tenant.user.id);

  const body = await (
    await POST(
      uploadRequest({
        applicationId: app.id,
        slot: "RESIDENT_REGISTRATION",
        file: fakeFile("../../etc/등본.png", "image/png"),
      }),
    )
  ).json();
  expect(body.document.name).toBe("등본.png");
});
