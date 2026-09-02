/**
 * 실거래가 권한 가드 — **판정의 단일 출처** (T4.3·T4.4).
 *
 * ## 인증을 새로 발명하지 않았다
 *
 * 이 task 는 인증 통로를 하나도 만들지 않는다. 이미 있는 둘을 그대로 쓴다:
 *
 * | 통로 | 원본 | 쓰는 곳 |
 * |---|---|---|
 * | `x-cron-secret` · `Authorization: Bearer` | T1.4 `app/api/cron/daily/auth.ts` | 크론·어드민 수동 트리거·curl |
 * | 세션 `isAdmin` · `x-admin-secret` | T2.5 `features/refund/ownership.ts` | 어드민 |
 *
 * `POST /api/deals/sync` 는 **둘 중 아무거나** 통과하면 된다. 크론 시크릿을 먼저 보고,
 * 없거나 틀리면 어드민 판정으로 넘긴다(그쪽이 401·403 을 정확히 구분해 준다).
 *
 * ## 조회는 공개, 구독은 로그인
 *
 * `/deals` 화면과 `GET /api/deals` 는 **비로그인도 볼 수 있다** — 국토부 실거래가는 공개
 * 데이터이고 개인정보가 한 줄도 없다. 근거는 task 문서의 "접근 정책" 절에 적었다.
 * 반대로 구독(`/api/transaction-alerts`)은 "누구의 구독인가" 가 곧 데이터라 로그인이 필요하고,
 * 온보딩 전(프로필 없음)이면 403 이다 — T4.1 커뮤니티와 같은 규칙이다.
 *
 * ## 구독의 소유는 **계정 단위**다
 *
 * 만들 때는 활성 프로필(T0.5 쿠키)이 주인이 되지만, 목록·삭제는 그 계정의 **모든 프로필**을
 * 본다. 세입자 프로필로 걸어 둔 알림을 임대인 프로필로 바꾼 뒤에도 지울 수 있어야 한다
 * (T4.1 이 "쓰기는 활성 프로필, 소유는 계정" 으로 정리한 규칙 그대로다).
 */
import { prisma, type Profile, type TransactionAlert } from "@zari/db";
import { authorizeCronRequest, CRON_AUTH_MESSAGE } from "@/app/api/cron/daily/auth";
import type { Guarded } from "@/features/landlord/ownership";
import { requireRefundAdmin } from "@/features/refund/ownership";
import { fail } from "@/lib/api/response";
import { getActiveProfile, getCurrentUser, type SessionUser } from "@/lib/auth/session";

export { ADMIN_SECRET_HEADER } from "@/features/refund/ownership";

/** 수집을 요청한 주체 — 응답·로그에 무엇이 돌렸는지 남긴다 */
export type SyncCaller = { via: "CRON" | "ADMIN"; actorName: string };

/**
 * `POST /api/deals/sync` 호출자 판정.
 *
 * 1. 크론 시크릿이 맞으면 통과(`via: "CRON"`).
 * 2. 아니면 어드민 판정(T2.5)으로 넘긴다 — 세션 `isAdmin` 또는 `x-admin-secret`.
 * 3. 둘 다 아니면 어드민 판정의 401·403 을 그대로 돌려준다.
 *
 * **크론 시크릿이 아예 설정돼 있지 않아도** 어드민 경로는 살아 있다(그쪽이 스스로 막는다).
 * 크론 시크릿을 제시했는데 값이 틀린 경우는 어드민 판정으로 내려가 401 이 된다 —
 * 같은 결과이므로 사유를 따로 나누지 않는다.
 */
export async function requireDealsSyncCaller(request: Request): Promise<Guarded<SyncCaller>> {
  const cron = authorizeCronRequest(request);
  if (cron.ok) return { data: { via: "CRON", actorName: "크론" } };

  const admin = await requireRefundAdmin(request);
  if (admin.response) {
    // 크론 시크릿이 설정돼 있지 않으면 그 사실을 알려 주는 편이 운영에 도움이 된다
    if (cron.reason === "SECRET_NOT_CONFIGURED") {
      return {
        response: fail(
          "UNAUTHORIZED",
          `${CRON_AUTH_MESSAGE.SECRET_NOT_CONFIGURED} 관리자 세션으로도 인증되지 않았습니다.`,
        ),
      };
    }
    return { response: admin.response };
  }
  return { data: { via: "ADMIN", actorName: admin.data.user.name } };
}

/** 로그인 사용자 + 구독을 만들 프로필(활성) + 계정의 모든 프로필 id */
export type AlertSession = {
  user: SessionUser;
  profile: Profile;
  profileIds: string[];
};

/** 로그인 + 프로필 확인. 401(비로그인) · 403(온보딩 전) */
export async function requireAlertProfile(): Promise<Guarded<AlertSession>> {
  const user = await getCurrentUser();
  if (!user) return { response: fail("UNAUTHORIZED", "로그인이 필요합니다.") };

  const profile = await getActiveProfile(user);
  if (!profile) return { response: fail("FORBIDDEN", "프로필이 필요합니다.") };

  return { data: { user, profile, profileIds: user.profiles.map((item) => item.id) } };
}

/** 내 구독인지 — 404(없음) · 403(남의 구독) */
export async function requireOwnAlert(
  session: AlertSession,
  id: string,
): Promise<Guarded<TransactionAlert>> {
  const alert = await prisma.transactionAlert.findUnique({ where: { id } });
  if (!alert) return { response: fail("NOT_FOUND", "구독을 찾을 수 없습니다.") };
  if (!session.profileIds.includes(alert.profileId)) {
    return { response: fail("FORBIDDEN", "내 구독만 삭제할 수 있습니다.") };
  }
  return { data: alert };
}
