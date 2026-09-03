/**
 * `GET /refunds/documents?applicationId=…&documentId=…` — **서류 뷰어 프록시** (T2.5).
 *
 * 서류는 web 의 private Blob 스토어에 있고, 읽기는 web 의
 * `GET /api/refunds/[id]/documents/[documentId]` 가 세션·권한을 확인한 뒤 스트리밍한다.
 * 어드민 앱에는 로그인이 없으므로(T6.3 범위) 브라우저가 그 경로를 직접 열면 401 이다.
 *
 * 그래서 **어드민 서버가 대신 받아 온다** — 서버 액션과 같은 `x-admin-secret` 을 붙여 web 을
 * 호출하고, 받은 스트림을 그대로 흘려보낸다. 시크릿은 브라우저에 노출되지 않는다.
 *
 * **T6.3 이 이 구멍을 닫았다.** 라우트 핸들러는 레이아웃 게이트를 거치지 않으므로 여기서
 * 직접 어드민 세션을 확인한다 — 로그인하지 않은 요청은 서류에 닿기 전에 401 이다.
 */
import { requireAdminGate } from "../../_shell/auth";
import { resolveWebUrl } from "../../cron/shared";

const SECRET_HEADER = "x-admin-secret";

export async function GET(request: Request): Promise<Response> {
  const denied = await requireAdminGate();
  if (denied) return new Response(denied.message, { status: denied.status });

  const url = new URL(request.url);
  const applicationId = url.searchParams.get("applicationId");
  const documentId = url.searchParams.get("documentId");
  if (!applicationId || !documentId) {
    return new Response("applicationId·documentId 가 필요합니다.", { status: 400 });
  }

  const secret = process.env.ADMIN_API_SECRET || process.env.CRON_SECRET;
  if (!secret) {
    return new Response("ADMIN_API_SECRET(또는 CRON_SECRET)이 설정돼 있지 않습니다.", {
      status: 500,
    });
  }

  const target = `${resolveWebUrl(process.env.NEXT_PUBLIC_WEB_URL)}/api/refunds/${encodeURIComponent(
    applicationId,
  )}/documents/${encodeURIComponent(documentId)}`;

  let upstream: Response;
  try {
    upstream = await fetch(target, { headers: { [SECRET_HEADER]: secret }, cache: "no-store" });
  } catch {
    return new Response("web 앱에 연결하지 못했습니다.", { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    return new Response("서류를 불러오지 못했습니다.", { status: upstream.status || 502 });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
      "Content-Disposition": upstream.headers.get("content-disposition") ?? "inline",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
