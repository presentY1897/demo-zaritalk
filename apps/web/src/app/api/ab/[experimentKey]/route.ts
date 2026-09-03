/**
 * `GET /api/ab/[experimentKey]` — 변형 배정 조회/생성 (T6.1).
 *
 * **비로그인 공개다.** 실험 대상이 미가입 세입자(공개 고지서 방문자)라 세션을 요구할 수 없다.
 * 노출되는 정보는 "이 브라우저가 어느 문구를 볼 것인가" 뿐이고, 개인정보가 없다.
 *
 * anonId 는 `POST /api/track`·`GET /api/notices/[token]`(T0.7·T1.8)과 **같은 규칙**으로
 * ① 쿠키 ② 서버 발급 순으로 정한다. ②였으면 응답에 `Set-Cookie` 를 실어 다음 요청부터 이어지게
 * 한다 — 그래야 배정이 이 방문자에게 고정된다.
 *
 * 로그인 상태로 부르면 배정에 `userId` 를 이어 붙인다(비어 있을 때만 — `features/ab/assign.ts`).
 * 공개 고지서 화면은 이 엔드포인트를 거치지 않고 `assignVariant` 를 서버에서 직접 부른다
 * (왕복을 하나 줄이고, 첫 페인트에 이미 변형이 정해져 있어야 깜빡임이 없다).
 * 이 엔드포인트는 **클라이언트에서 배정을 물어야 하는 화면과 진단·E2E** 를 위한 것이다.
 */
import { assignVariant } from "@/features/ab/assign";
import { findExperiment } from "@/features/ab/experiments";
import { fail, ok } from "@/lib/api/response";
import { getCurrentUser } from "@/lib/auth/session";
import {
  createAnonId,
  readAnonIdFromCookieHeader,
  serializeAnonIdCookie,
} from "@/lib/tracking/anon-id";

type Context = { params: Promise<{ experimentKey: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  const { experimentKey } = await context.params;

  const spec = findExperiment(experimentKey);
  if (!spec) return fail("NOT_FOUND", "등록되지 않은 실험입니다.");

  const cookieAnonId = readAnonIdFromCookieHeader(request.headers.get("cookie"));
  const anonId = cookieAnonId ?? createAnonId();

  const user = await getCurrentUser();
  const assignment = await assignVariant(anonId, spec.key, user?.id);
  if (!assignment) return fail("NOT_FOUND", "등록되지 않은 실험입니다.");

  return ok(
    {
      experiment: {
        key: spec.key,
        name: spec.name,
        description: spec.description,
        variants: spec.variants.map((variant) => ({
          key: variant.key,
          label: variant.label,
          weight: variant.weight,
        })),
      },
      assignment: {
        anonId: assignment.anonId,
        variant: assignment.variant,
        userId: assignment.userId,
        assignedAt: assignment.assignedAt.toISOString(),
        created: assignment.created,
      },
    },
    cookieAnonId ? undefined : { headers: { "set-cookie": serializeAnonIdCookie(anonId) } },
  );
}
