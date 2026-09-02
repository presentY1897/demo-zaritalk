/**
 * 환급 신청 권한 가드 — **판정의 단일 출처** (T2.4·T2.5).
 *
 * 신청서는 당사자가 둘이다: **낸 세입자**와 **심사하는 어드민**. 민원(T2.6)처럼 두 방향이라
 * 판정이 화면·API 로 흩어지면 한쪽만 고쳐서 구멍이 난다. 그래서 여기 한 곳에 모은다.
 *
 * ```ts
 * const owned = await requireOwnApplication(id);
 * if (owned.response) return owned.response;   // 401 · 403 · 404
 * const { application, tenant } = owned.data;
 * ```
 *
 * ## 상태 코드 규칙 (T1.1·T1.3·T2.6 과 같다)
 *
 * | 상황 | status · code |
 * |---|---|
 * | 비로그인·만료 세션 | 401 `UNAUTHORIZED` |
 * | 로그인했지만 세입자 프로필 없음 | 403 `FORBIDDEN` |
 * | 없는 신청 id | 404 `NOT_FOUND` |
 * | **남의 신청** | 403 `FORBIDDEN` |
 * | 로그인했지만 `isAdmin` 이 아님(심사 API) | 403 `FORBIDDEN` |
 *
 * ## 어드민 인증 — 어드민 앱에는 로그인이 없다(T6.3 범위)
 *
 * 심사 API 는 **언제나 `User.isAdmin` 으로 판정**한다. 통로가 둘이다:
 *
 * | 통로 | 판정 |
 * |---|---|
 * | ① 세션 쿠키 | `getCurrentUser()` → `isAdmin` 이면 통과, 아니면 **403**. 심사자 = 그 사용자 |
 * | ② 서비스 시크릿(`x-admin-secret`) | 어드민 앱(3001)의 **서버 액션**만 쓴다. 값이 맞으면 DB 에서 `isAdmin: true` 인 계정을 찾아 **그 사람을 심사자로 기록**한다. 어드민 계정이 하나도 없으면 403 |
 *
 * ②는 T1.4 크론 트리거(`CRON_SECRET` + 서버 액션)와 같은 방식이다 — 시크릿은 어드민 서버에만
 * 있고 브라우저 번들에 실리지 않는다. **시크릿이 맞아도 진짜 `isAdmin` 계정이 없으면 통과하지
 * 못하므로** `reviewedById` 는 언제나 실재하는 관리자다. T6.3 이 어드민 로그인을 붙이면
 * `resolveServiceAdmin` 분기만 지우면 된다.
 */
import {
  prisma,
  type Building,
  type Lease,
  type Profile,
  type RefundApplication,
  type Unit,
  type User,
} from "@zari/db";
import type { Guarded } from "@/features/landlord/ownership";
import { requireTenant, type TenantSession } from "@/features/tenant/ownership";
import { fail } from "@/lib/api/response";
import { getCurrentUser } from "@/lib/auth/session";

/** 어드민 앱이 web 을 부를 때 쓰는 헤더 */
export const ADMIN_SECRET_HEADER = "x-admin-secret";

/** 계약 + 호실 + 건물 + 건물주 이름까지 — 신청서·심사 화면이 그대로 쓴다 */
export type RefundLeaseRow = Lease & {
  unit: Unit & { building: Building & { ownerProfile: Profile & { user: User } } };
};

/** 신청 1건 + 화면·심사에 필요한 만큼의 관계 */
export type RefundApplicationRow = RefundApplication & {
  tenantProfile: Profile & { user: User };
  lease: RefundLeaseRow | null;
  reviewedBy: User | null;
};

/** 모든 조회가 같은 모양을 읽게 하는 include */
export const REFUND_APPLICATION_INCLUDE = {
  tenantProfile: { include: { user: true } },
  lease: {
    include: {
      unit: { include: { building: { include: { ownerProfile: { include: { user: true } } } } } },
    },
  },
  reviewedBy: true,
} as const;

export type OwnedApplication = { tenant: TenantSession; application: RefundApplicationRow };

/** 심사자 — 세션으로 들어왔든 서비스 시크릿으로 들어왔든 **실재하는 `isAdmin` User** 다 */
export type AdminActor = { user: User; via: "SESSION" | "SERVICE" };

export type ApplicationViewer =
  | { kind: "TENANT"; tenant: TenantSession }
  | { kind: "ADMIN"; admin: AdminActor };

export type ViewedApplication = { viewer: ApplicationViewer; application: RefundApplicationRow };

export async function findApplication(id: string): Promise<RefundApplicationRow | null> {
  return prisma.refundApplication.findUnique({
    where: { id },
    include: REFUND_APPLICATION_INCLUDE,
  });
}

/**
 * 내 신청인지 확인 — 세입자 전용. 401 · 403(프로필 없음) · 404 · 403(남의 신청).
 *
 * 남의 신청을 404 로 감추지 않고 403 을 주는 것은 T1.1·T2.6 과 같은 선택이다
 * (최소 테스트가 "남의 신청 403" 을 요구한다). **화면(서버 컴포넌트)만 `notFound()` 로 막는다.**
 */
export async function requireOwnApplication(id: string): Promise<Guarded<OwnedApplication>> {
  const tenant = await requireTenant();
  if (tenant.response) return { response: tenant.response };

  const application = await findApplication(id);
  if (!application) return { response: fail("NOT_FOUND", "환급 신청을 찾을 수 없습니다.") };
  if (application.tenantProfileId !== tenant.data.profile.id) {
    return { response: fail("FORBIDDEN", "내 환급 신청이 아닙니다.") };
  }
  return { data: { tenant: tenant.data, application } };
}

/** 서비스 시크릿(어드민 앱 서버 액션)의 값 — 전용 값이 없으면 크론 시크릿을 쓴다 */
function serviceSecret(): string | undefined {
  return process.env.ADMIN_API_SECRET || process.env.CRON_SECRET || undefined;
}

/** 시크릿이 맞으면 DB 의 관리자 계정을 심사자로 세운다. 관리자가 없으면 null. */
async function resolveServiceAdmin(request: Request): Promise<User | null> {
  const secret = serviceSecret();
  const provided = request.headers.get(ADMIN_SECRET_HEADER);
  if (!secret || !provided || provided !== secret) return null;

  return prisma.user.findFirst({
    where: { isAdmin: true },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * 어드민 판정. **`User.isAdmin` 이 유일한 기준이다.**
 *
 * - 세션이 있는데 어드민이 아니면 **403** (최소 테스트가 요구하는 "비어드민 403")
 * - 세션이 없고 시크릿도 없으면 **401**
 * - 시크릿은 맞는데 `isAdmin` 계정이 DB 에 하나도 없으면 **403**
 */
export async function requireRefundAdmin(request: Request): Promise<Guarded<AdminActor>> {
  const user = await getCurrentUser();
  if (user) {
    if (!user.isAdmin) return { response: fail("FORBIDDEN", "관리자만 접근할 수 있습니다.") };
    return { data: { user, via: "SESSION" } };
  }

  const provided = request.headers.get(ADMIN_SECRET_HEADER);
  if (!provided) return { response: fail("UNAUTHORIZED", "로그인이 필요합니다.") };

  const serviceAdmin = await resolveServiceAdmin(request);
  if (!serviceAdmin) return { response: fail("FORBIDDEN", "관리자만 접근할 수 있습니다.") };
  return { data: { user: serviceAdmin, via: "SERVICE" } };
}

/**
 * 신청 1건을 **볼 수 있는 사람** — 낸 세입자 또는 어드민. 서류 뷰어·상세 조회가 쓴다.
 *
 * 어드민 판정을 먼저 한다(어드민 세션으로 세입자 화면 API 를 부를 일은 없다).
 * 어느 쪽도 아니면 세입자 가드가 내놓은 응답을 그대로 돌려준다 — 401/403/404 가 그쪽 규칙대로 나온다.
 */
export async function requireApplicationAccess(
  request: Request,
  id: string,
): Promise<Guarded<ViewedApplication>> {
  const user = await getCurrentUser();
  const hasAdminSecret = request.headers.get(ADMIN_SECRET_HEADER) !== null;

  if (user?.isAdmin || (!user && hasAdminSecret)) {
    const admin = await requireRefundAdmin(request);
    if (admin.response) return { response: admin.response };
    const application = await findApplication(id);
    if (!application) return { response: fail("NOT_FOUND", "환급 신청을 찾을 수 없습니다.") };
    return { data: { viewer: { kind: "ADMIN", admin: admin.data }, application } };
  }

  const owned = await requireOwnApplication(id);
  if (owned.response) return { response: owned.response };
  return {
    data: { viewer: { kind: "TENANT", tenant: owned.data.tenant }, application: owned.data.application },
  };
}


