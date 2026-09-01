/**
 * `GET /api/notices/[token]` — 공개 고지서 데이터 (T1.8).
 *
 * **비로그인 공개다.** 세션을 보지 않고 토큰만으로 연다. 그래서 두 가지를 지킨다:
 * - 토큰은 추측 불가한 난수(`features/notice/token.ts`)
 * - 수신 번호는 가운데를 가려서 내보낸다(`maskPhone`)
 *
 * 부수효과 2개가 이 GET 에 붙어 있다(task 정의 그대로):
 * 1. **최초 1회만** `openedAt` 기록 — 재조회로 갱신되지 않는다(임대인 이력의 "열람" 신뢰도).
 * 2. `notice_view` 트래킹 적재 — [D2](../../../../../../docs/DECISIONS.md#-d2-ab-실험-소재-1개-실운영) 퍼널의 첫 단계.
 *
 * 왜 페이지 렌더가 아니라 이 API 가 기록하는가 — 페이지는 서버 렌더라 **링크 미리보기 봇**
 * (카카오톡·슬랙 OG 크롤러)도 HTML 을 가져간다. 크롤러는 JS 를 돌리지 않으므로, 브라우저가
 * 실제로 실행하는 이 호출에서만 기록해야 "열람"이 사람의 열람을 뜻한다.
 *
 * `notice_view` 를 클라이언트 `useTrack()` 이 아니라 서버에서 적재하는 이유도 같다 —
 * 열람 기록과 조회 이벤트가 **같은 한 번의 요청**에서 나와야 둘이 어긋나지 않는다.
 * anonId 는 `POST /api/track`(T0.7)과 같은 규칙으로 ① 쿠키 ② 서버 발급 순으로 정한다.
 */
import { prisma } from "@zari/db";
import { resolveNoticeCtaVariant } from "@/features/notice/cta";
import { loadPublicNotice, markNoticeOpened } from "@/features/notice/queries";
import { isNoticeTokenShape } from "@/features/notice/token";
import { fail, ok } from "@/lib/api/response";
import {
  createAnonId,
  readAnonIdFromCookieHeader,
  serializeAnonIdCookie,
} from "@/lib/tracking/anon-id";
import { TRACK_EVENTS } from "@/lib/tracking/events";

type Context = { params: Promise<{ token: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  const { token } = await context.params;
  if (!isNoticeTokenShape(token)) return fail("NOT_FOUND", "고지서를 찾을 수 없습니다.");

  const notice = await loadPublicNotice(token);
  if (!notice) return fail("NOT_FOUND", "고지서를 찾을 수 없습니다.");

  // 최초 1회만. 두 번째부터는 count 0 이라 시각이 유지된다.
  const firstOpen = await markNoticeOpened(token);

  const cookieAnonId = readAnonIdFromCookieHeader(request.headers.get("cookie"));
  const anonId = cookieAnonId ?? createAnonId();
  const variant = resolveNoticeCtaVariant(new URL(request.url).searchParams.get("variant"));

  await prisma.trackingEvent.create({
    data: {
      anonId,
      name: TRACK_EVENTS.NOTICE_VIEW,
      path: `/notice/${token}`,
      props: { token, kind: notice.kind, variant, firstOpen },
    },
  });

  return ok(
    { notice: { ...notice, openedAt: notice.openedAt ?? (firstOpen ? new Date().toISOString() : null) }, firstOpen },
    cookieAnonId ? undefined : { headers: { "set-cookie": serializeAnonIdCookie(anonId) } },
  );
}
