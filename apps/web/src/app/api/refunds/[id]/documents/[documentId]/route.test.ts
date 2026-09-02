/**
 * `GET /api/refunds/[id]/documents/[documentId]` 테스트 (T2.4·T2.5) — 서류 뷰어.
 *
 * private 스토어 배달 경로다. 여기서 지키는 것은 **누가 볼 수 있는가** 하나다 —
 * 낸 세입자와 어드민뿐이고, 나머지는 파일 근처에도 가지 못한다.
 */
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import { loginAs } from "@/features/landlord/testing";
import { resetUploadMemory } from "@/features/refund/storage";
import {
  createAdmin,
  createApplication,
  createNonAdmin,
  createOtherRefundScene,
  createRefundScene,
  fakeFile,
  uploadRequest,
} from "@/features/refund/testing";
import { resetTestCookies } from "@/lib/auth/testing";
import { POST as upload } from "@/app/api/uploads/route";
import { GET } from "./route";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
  resetUploadMemory();
  process.env.ADMIN_API_SECRET = "test-admin-secret";
});

const view = (id: string, documentId: string, init?: RequestInit) =>
  GET(new Request(`http://localhost/api/refunds/${id}/documents/${documentId}`, init), {
    params: Promise.resolve({ id, documentId }),
  });

/** 세입자가 서류 1장을 실제로 올린 상태를 만든다 */
async function sceneWithDocument() {
  const scene = await createRefundScene();
  const application = await createApplication(scene);
  await loginAs(scene.tenant.user.id);

  const body = await (
    await upload(
      uploadRequest({
        applicationId: application.id,
        slot: "LEASE_CONTRACT",
        file: fakeFile("계약서.pdf", "application/pdf", 512),
      }),
    )
  ).json();

  return { scene, application, documentId: body.document.id as string };
}

test("낸 세입자는 자기 서류를 본다 — 스트리밍 + private 캐시 헤더", async () => {
  const { application, documentId } = await sceneWithDocument();

  const response = await view(application.id, documentId);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("application/pdf");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("content-disposition")).toContain("inline");

  expect((await response.arrayBuffer()).byteLength).toBe(512);
});

test("어드민은 남의 서류도 본다 (심사 화면 뷰어)", async () => {
  const { application, documentId } = await sceneWithDocument();

  resetTestCookies();
  const admin = await createAdmin();
  await loginAs(admin.id);

  expect((await view(application.id, documentId)).status).toBe(200);
});

test("어드민 앱 프록시 — 서비스 시크릿으로도 열린다", async () => {
  const { application, documentId } = await sceneWithDocument();

  resetTestCookies();
  await createAdmin();
  const response = await view(application.id, documentId, {
    headers: { "x-admin-secret": "test-admin-secret" },
  });
  expect(response.status).toBe(200);
});

test("남의 세입자는 403, 비어드민 계정도 403", async () => {
  const { application, documentId } = await sceneWithDocument();

  resetTestCookies();
  const other = await createOtherRefundScene();
  await loginAs(other.tenant.user.id);
  expect((await view(application.id, documentId)).status).toBe(403);

  resetTestCookies();
  const stranger = await createNonAdmin("01044444444");
  await loginAs(stranger.id);
  expect((await view(application.id, documentId)).status).toBe(403);
});

test("비로그인은 401", async () => {
  const { application, documentId } = await sceneWithDocument();
  resetTestCookies();
  expect((await view(application.id, documentId)).status).toBe(401);
});

test("없는 서류 id 는 404, 없는 신청 id 도 404", async () => {
  const { scene, application } = await sceneWithDocument();
  expect((await view(application.id, "nope")).status).toBe(404);
  expect((await view("nope", "nope")).status).toBe(404);
  expect(scene.tenant.user.name).toBe("박세입");
});
