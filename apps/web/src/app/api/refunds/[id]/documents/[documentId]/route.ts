/**
 * `GET /api/refunds/[id]/documents/[documentId]` — **서류 뷰어**(private Blob 배달) (T2.4·T2.5).
 *
 * 서류는 private 스토어에 있다([D3](../../../../../../../../docs/DECISIONS.md)). Blob URL 만으로는
 * 열리지 않으므로, 이 라우트가 **요청마다 권한을 확인하고** SDK 로 스트림을 받아 그대로 흘려보낸다.
 * Vercel 문서가 private blob 배달에 권하는 방식이고, 인증을 `get()` **바로 옆**에서 한다
 * (미들웨어·CDN 캐시에 기대지 말라는 문서의 경고를 그대로 따랐다).
 *
 * 볼 수 있는 사람은 **낸 세입자**와 **어드민** 둘뿐이다(`requireApplicationAccess`).
 * 어드민 앱은 로그인이 없어 자기 서버 라우트(`/refunds/documents`)가 서비스 시크릿을 붙여
 * 이 경로를 대신 호출한다.
 *
 * | 실패 | status · code |
 * |---|---|
 * | 비로그인 | 401 `UNAUTHORIZED` |
 * | 남의 신청 | 403 `FORBIDDEN` |
 * | 없는 신청·없는 서류·스토어에 파일 없음 | 404 `NOT_FOUND` |
 *
 * 응답 헤더:
 * - `Cache-Control: private, no-store` — 개인 서류다. 디스크에 남기지 않는다
 * - `X-Content-Type-Options: nosniff` — 브라우저가 타입을 추측하지 못하게
 * - `Content-Disposition: inline` — 심사자가 새 탭에서 바로 본다(파일명은 RFC 5987 인코딩)
 */
import { requireApplicationAccess } from "@/features/refund/ownership";
import { readDocuments } from "@/features/refund/queries";
import { getDocument } from "@/features/refund/storage";
import { fail } from "@/lib/api/response";

type Context = { params: Promise<{ id: string; documentId: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  const { id, documentId } = await context.params;

  const access = await requireApplicationAccess(request, id);
  if (access.response) return access.response;

  const document = readDocuments(access.data.application.documents).find(
    (doc) => doc.id === documentId,
  );
  if (!document) return fail("NOT_FOUND", "서류를 찾을 수 없습니다.");

  // 스토어가 없는 파일이면 null 이고, 네트워크·토큰 문제면 예외다 — 둘을 구분해 돌려준다
  let stored: Awaited<ReturnType<typeof getDocument>>;
  try {
    stored = await getDocument(document.pathname);
  } catch {
    return fail("INTERNAL_ERROR", "서류 저장소에서 파일을 가져오지 못했습니다.");
  }
  if (!stored) return fail("NOT_FOUND", "서류 파일을 찾을 수 없습니다.");

  return new Response(stored.stream, {
    status: 200,
    headers: {
      "Content-Type": stored.contentType || document.contentType,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(document.name)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
