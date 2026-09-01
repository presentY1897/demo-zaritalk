/**
 * `POST /api/track` — 트래킹 이벤트 수집(T0.7).
 *
 * - 단건(`{...}`)과 배열(`[{...}, ...]`) 둘 다 받는다. 클라이언트는 배치로 보낸다.
 * - zod 로 검증하고 어긋나면 400 `VALIDATION_ERROR`(공용 `fail`).
 * - 로그인 상태면 `userId` 를 붙여 저장한다 — 익명 이벤트와 로그인 이후 이벤트를
 *   같은 anonId 로 이어 붙일 수 있어야 퍼널(D2)이 성립한다.
 * - anonId 는 ① 요청 본문 ② `zari_anon` 쿠키 ③ 서버 발급 순으로 정한다.
 *   **요청을 버리지 않는다** — 쿠키가 아직 없는 첫 요청도 수집하고, 이때는 응답에
 *   `Set-Cookie` 로 방금 발급한 anonId 를 심어 다음 요청부터 이어지게 한다.
 */
import { prisma, type Prisma } from "@zari/db";
import { ok, parseJson } from "@/lib/api/response";
import { getCurrentUser } from "@/lib/auth/session";
import {
  createAnonId,
  readAnonIdFromCookieHeader,
  serializeAnonIdCookie,
} from "@/lib/tracking/anon-id";
import { trackPayloadSchema } from "@/lib/tracking/schema";

export async function POST(request: Request) {
  const parsed = await parseJson(request, trackPayloadSchema);
  if (parsed.response) return parsed.response;

  const events = Array.isArray(parsed.data) ? parsed.data : [parsed.data];

  const cookieAnonId = readAnonIdFromCookieHeader(request.headers.get("cookie"));
  const fallbackAnonId = cookieAnonId ?? createAnonId();
  // 쿠키가 없어 서버가 발급한 경우에만 응답에 심는다(본문 anonId 로 쿠키를 덮어쓰게 두지 않는다).
  const issuedAnonId = cookieAnonId ? null : fallbackAnonId;

  const user = await getCurrentUser();

  await prisma.trackingEvent.createMany({
    data: events.map((event) => ({
      anonId: event.anonId ?? fallbackAnonId,
      userId: user?.id ?? null,
      name: event.name,
      ...(event.props ? { props: event.props as Prisma.InputJsonObject } : {}),
      path: event.path ?? null,
      sessionId: event.sessionId ?? null,
    })),
  });

  return ok(
    { accepted: events.length },
    issuedAnonId
      ? { headers: { "set-cookie": serializeAnonIdCookie(issuedAnonId) } }
      : undefined,
  );
}
