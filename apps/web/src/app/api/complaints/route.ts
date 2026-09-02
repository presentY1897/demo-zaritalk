/**
 * `GET·POST /api/complaints` — 민원 목록·접수 (T2.6).
 *
 * ## `GET` — 어느 시점으로 볼지(`?role=`)
 * 민원은 당사자가 둘이라 목록도 둘이다. `role` 을 생략하면 **내 프로필로 정한다**(세입자 우선) —
 * 세입자 계정은 자기가 낸 민원을, 임대인 계정은 자기 건물의 민원을 본다.
 * 프로필이 없는 유형으로 `role` 을 찍으면 403 이다(예: 세입자 계정 + `role=landlord`).
 *
 * ## `POST` — 접수는 세입자만
 * 계약 소유 판정은 `features/complaint/ownership.ts` 의 `requireOwnComplaintLease` 한 곳에서만 한다.
 *
 * | 실패 | status · code |
 * |---|---|
 * | 비로그인 | 401 `UNAUTHORIZED` |
 * | 프로필 없음(요청한 시점의 프로필이 없음) | 403 `FORBIDDEN` |
 * | 없는 계약 | 404 `NOT_FOUND` |
 * | **내 계약이 아님**(계약이 없는 세입자 포함) | 403 `FORBIDDEN` |
 * | 진행 중(ACTIVE)이 아닌 계약 | 409 `CONFLICT` |
 * | 제목·내용 형식 오류 | 400 `VALIDATION_ERROR` |
 */
import { prisma } from "@zari/db";
import { requireOwnComplaintLease } from "@/features/complaint/ownership";
import {
  getComplaintDetail,
  listComplaintLeaseOptions,
  listLandlordComplaints,
  listTenantComplaints,
} from "@/features/complaint/queries";
import { createComplaintSchema, listComplaintsQuerySchema } from "@/features/complaint/schema";
import { findLandlordProfile } from "@/features/landlord/ownership";
import { findTenantProfile, requireTenant } from "@/features/tenant/ownership";
import { created, fail, ok, parseJson, parseQuery } from "@/lib/api/response";
import { getCurrentUser } from "@/lib/auth/session";

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요합니다.");

  const parsed = parseQuery(request, listComplaintsQuerySchema);
  if (parsed.response) return parsed.response;

  const tenantProfile = findTenantProfile(user);
  const landlordProfile = findLandlordProfile(user);
  const role = parsed.data.role ?? (tenantProfile ? "tenant" : "landlord");

  if (role === "tenant") {
    if (!tenantProfile) return fail("FORBIDDEN", "세입자 프로필이 필요합니다.");
    const [complaints, leases] = await Promise.all([
      listTenantComplaints(tenantProfile.id),
      listComplaintLeaseOptions(tenantProfile.id),
    ]);
    return ok({ complaints, leases });
  }

  if (!landlordProfile) return fail("FORBIDDEN", "임대인 프로필이 필요합니다.");
  const complaints = await listLandlordComplaints(landlordProfile.id);
  return ok({ complaints, leases: [] });
}

export async function POST(request: Request): Promise<Response> {
  const tenant = await requireTenant();
  if (tenant.response) return tenant.response;

  const parsed = await parseJson(request, createComplaintSchema);
  if (parsed.response) return parsed.response;
  const input = parsed.data;

  const owned = await requireOwnComplaintLease(tenant.data.profile.id, input.leaseId);
  if (owned.response) return owned.response;

  const row = await prisma.complaint.create({
    data: {
      leaseId: owned.data.id,
      tenantProfileId: tenant.data.profile.id,
      title: input.title,
      body: input.body,
      // 사진 업로드(D3 Vercel Blob)는 T2.4 소유라 지금 화면은 보내지 않는다.
      // 자리는 열어 둔다 — URL 배열이 오면 그대로 저장된다.
      photos: input.photos && input.photos.length > 0 ? input.photos : undefined,
      // status 는 스키마 기본값 OPEN — 임대인 홈(T1.9)의 "미확인 민원" 배지가 이 값을 센다
    },
  });

  const complaint = await getComplaintDetail(row.id);
  if (!complaint) return fail("INTERNAL_ERROR", "민원을 저장하지 못했습니다.");
  return created({ complaint });
}
