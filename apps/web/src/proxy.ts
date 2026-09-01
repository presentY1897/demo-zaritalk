/**
 * Proxy — Next 16 에서 `middleware` 규약을 대체한 파일 규약(T0.7).
 *
 * - 파일 위치: `app` 과 같은 레벨, 즉 `src/` 를 쓰는 이 앱에서는 `src/proxy.ts`
 * - export 이름: `proxy` (또는 default). 함수는 하나만 둘 수 있다.
 * - 런타임: Node.js 고정 — `runtime` 세그먼트 옵션을 쓰면 에러가 난다.
 * - 문서: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`
 *
 * 하는 일: 첫 방문에 anonId 1st-party 쿠키를 발급한다. 그 외 라우팅에는 손대지 않는다.
 */
import { NextResponse, type NextRequest } from "next/server";
import {
  ANON_ID_COOKIE,
  anonIdCookieOptions,
  createAnonId,
  isAnonId,
} from "@/lib/tracking/anon-id";

export function proxy(request: NextRequest) {
  // 이미 우리가 발급한 값이 있으면 그대로 둔다(형식이 깨진 값은 새로 발급).
  if (isAnonId(request.cookies.get(ANON_ID_COOKIE)?.value)) return NextResponse.next();

  const anonId = createAnonId();

  // 요청 쿠키에도 심어 같은 요청을 처리하는 Route Handler·서버 컴포넌트가
  // 방금 발급한 값을 바로 읽게 한다(`request.cookies.set` 은 Cookie 헤더를 갱신한다).
  // `next({ request })` 는 이 헤더를 앱 쪽으로만 넘기고 클라이언트에 노출하지 않는다.
  request.cookies.set(ANON_ID_COOKIE, anonId);
  const response = NextResponse.next({ request: { headers: request.headers } });

  response.cookies.set(ANON_ID_COOKIE, anonId, anonIdCookieOptions);
  return response;
}

export const config = {
  // 정적 자산·이미지 최적화·메타데이터 파일에는 쿠키를 심을 이유가 없다.
  // 확장자가 붙은 경로(`/logo.png` 같은 public 자산)도 통째로 제외한다.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.[\\w]+$).*)",
  ],
};
