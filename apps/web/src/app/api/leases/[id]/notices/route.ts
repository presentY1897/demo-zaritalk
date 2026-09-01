/**
 * `GET·POST /api/leases/[id]/notices` — 고지서 발송 (T1.7).
 *
 * - `GET` : 발송 시트가 필요한 계약 정보(세입자·건물·청구 목록). 시트는 `leaseId` 하나만 알면
 *   되도록 이 엔드포인트로 스스로 읽는다 — T1.2(계약 상세)·T1.5(청구 시트)가 꽂기 쉽게.
 * - `POST`: 종류·대상 청구를 받아 템플릿을 렌더하고 **공개 토큰을 발급해** `MessageLog` 를 만든다.
 *
 * **실제 SMS·알림톡은 나가지 않는다.** `MessageLog` 한 줄과 공개 고지서 링크가 발송의 전부다
 * ([기반 결정](../../../../../../../docs/DECISIONS.md) — "알림톡 시뮬레이터").
 *
 * 금액 문구는 원장 엔진(`@/lib/rent`)이 계산한 값을 템플릿이 옮겨 적는다 — 여기서 계산하지 않는다.
 */
import { prisma } from "@zari/db";
import { requireLandlord } from "@/features/landlord/ownership";
import { noticeKindRequiresCharge, demoBankAccount } from "@/features/notice/constants";
import { requireOwnedLease } from "@/features/notice/guards";
import { getNoticeTarget, toMessageLogDto } from "@/features/notice/queries";
import { sendNoticeSchema } from "@/features/notice/schema";
import { noticeUrl, renderNoticeTemplate } from "@/features/notice/template";
import { createNoticeToken } from "@/features/notice/token";
import { created, fail, ok, parseJson } from "@/lib/api/response";
import { kstToday } from "@/lib/rent";

type Context = { params: Promise<{ id: string }> };

/** 토큰 유니크 충돌은 사실상 나지 않지만(128비트 난수), 나더라도 발송이 실패하지 않게 재시도한다. */
const TOKEN_RETRIES = 3;

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "P2002";
}

/** 공개 고지서 링크의 기준 주소 — 배포 도메인이 정해져 있으면 그것을, 없으면 요청 origin. */
function baseUrl(request: Request): string {
  return process.env.NEXT_PUBLIC_WEB_URL || new URL(request.url).origin;
}

export async function GET(_request: Request, context: Context): Promise<Response> {
  const landlord = await requireLandlord();
  if (landlord.response) return landlord.response;

  const { id } = await context.params;
  const owned = await requireOwnedLease(landlord.data, id);
  if (owned.response) return owned.response;

  const target = await getNoticeTarget(id);
  if (!target) return fail("NOT_FOUND", "계약을 찾을 수 없습니다.");
  return ok({ target });
}

export async function POST(request: Request, context: Context): Promise<Response> {
  const landlord = await requireLandlord();
  if (landlord.response) return landlord.response;

  const { id } = await context.params;
  const owned = await requireOwnedLease(landlord.data, id);
  if (owned.response) return owned.response;
  const lease = owned.data;

  const parsed = await parseJson(request, sendNoticeSchema);
  if (parsed.response) return parsed.response;
  const input = parsed.data;

  // 대상 청구 — 종류가 요구할 때만 쓴다. **다른 계약의 청구는 받지 않는다.**
  let charge = null;
  if (noticeKindRequiresCharge(input.kind)) {
    if (!input.chargeId) {
      return fail("VALIDATION_ERROR", "고지할 청구를 선택해 주세요.");
    }
    charge = await prisma.rentCharge.findUnique({ where: { id: input.chargeId } });
    if (!charge) return fail("NOT_FOUND", "청구를 찾을 수 없습니다.");
    if (charge.leaseId !== lease.id) {
      return fail("VALIDATION_ERROR", "이 계약의 청구가 아닙니다.");
    }
  }

  const asOf = kstToday();
  const { title, body } = renderNoticeTemplate({
    kind: input.kind,
    landlordName: landlord.data.user.name,
    tenantName: lease.tenantName,
    buildingName: lease.unit.building.name,
    unitLabel: lease.unit.label,
    lease: {
      monthlyRent: lease.monthlyRent,
      maintenanceFee: lease.maintenanceFee,
      paymentDay: lease.paymentDay,
      startDate: lease.startDate,
      endDate: lease.endDate,
    },
    charge: charge ? { ...charge } : null,
    asOf,
    bankAccount: demoBankAccount(landlord.data.user.name),
    memo: input.memo ?? null,
  });

  for (let attempt = 0; ; attempt += 1) {
    const token = createNoticeToken();
    try {
      const row = await prisma.messageLog.create({
        data: {
          kind: input.kind,
          toPhone: lease.tenantPhone,
          title,
          body,
          token,
          leaseId: lease.id,
          chargeId: charge?.id ?? null,
        },
        include: { lease: { include: { unit: { include: { building: true } } } } },
      });
      return created({
        message: toMessageLogDto(row),
        noticeUrl: noticeUrl(baseUrl(request), token),
      });
    } catch (error) {
      if (isUniqueViolation(error) && attempt < TOKEN_RETRIES) continue;
      throw error;
    }
  }
}
