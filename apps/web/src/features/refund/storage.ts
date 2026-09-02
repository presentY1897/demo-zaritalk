/**
 * 서류 저장소 — **Vercel Blob private 스토어**([D3](../../../../../docs/DECISIONS.md)) 어댑터. (T2.4)
 *
 * 서버 전용이다(라우트 핸들러에서만 부른다). 화면·순수 규칙 모듈은 이 파일을 모른다 —
 * 그래서 업로드 제한 테스트(`documents.test.ts`)가 네트워크 없이 돈다.
 *
 * ## private 스토어를 쓰는 이유와 읽는 방법
 *
 * 계약서·주민등록등본이다. public 스토어면 URL 하나만 새어 나가도 남의 등본이 열린다.
 * private 스토어의 blob URL(`https://<store>.private.blob.vercel-storage.com/...`)은
 * **인증 없이는 열리지 않고**, 읽기는 서버가 SDK 의 `get(pathname, { access: "private" })` 로
 * 스트림을 받아 응답에 실어 보낸다(`GET /api/refunds/[id]/documents/[documentId]`).
 * Vercel 문서가 권하는 배달 방식 그대로이고, **권한 판정을 `get()` 바로 옆에서** 한다.
 *
 * > 서명 URL(`issueSignedToken` + `presignUrl`)도 있지만 쓰지 않았다 — 한 번 발급된 서명 URL 은
 * > 유효시간 동안 **누구에게 전달돼도 열린다**. 여기서 읽을 수 있는 사람은 "그 신청의 세입자
 * > 또는 어드민" 이라 요청마다 판정이 달라지므로, 매 요청 세션을 확인하는 스트리밍 라우트가 맞다.
 * > (Vercel 문서도 private blob 은 미들웨어·캐시에 기대지 말고 라우트에서 인증하라고 못박는다.)
 *
 * ## 드라이버 — 테스트·로컬에서 네트워크를 타지 않는다
 *
 * | 조건 | 드라이버 |
 * |---|---|
 * | `ZARI_UPLOAD_DRIVER=memory\|blob` | 그 값 그대로(마지막 수단) |
 * | `DATABASE_URL` 이 **테스트 DB**(이름에 `test`) | `memory` — 단위 테스트·E2E |
 * | `BLOB_READ_WRITE_TOKEN` 도 `BLOB_STORE_ID` 도 없음 | `memory` — 토큰 없이 받은 클론 |
 * | 그 밖(운영·프리뷰) | `blob` |
 *
 * 테스트 DB 판정을 기준으로 삼은 이유: E2E 는 `playwright.config.ts` 가 `DATABASE_URL` 만
 * 테스트 DB 로 바꿔 web 앱을 띄운다(그 파일은 이 task 소유가 아니라 손대지 않았다).
 * 즉 **"테스트 DB 를 보고 있다" 가 곧 "지금은 테스트다"** 이고, 운영 DB 를 보면서 memory 로
 * 떨어질 길이 없다. 판정 규칙은 `@zari/db/testing` 의 `assertTestDatabase()` 와 같은 정규식이다.
 */
import { get, put } from "@vercel/blob";

export type StoredDocument = { url: string; pathname: string };

export type DocumentStream = {
  stream: ReadableStream<Uint8Array>;
  contentType: string;
  size: number | null;
};

export type UploadDriver = "blob" | "memory";

/** `@zari/db/testing` 의 `assertTestDatabase()` 와 같은 규칙 — 이름에 `test` 토큰이 있는 DB */
function isTestDatabase(url: string | undefined): boolean {
  if (!url) return false;
  let dbName = "";
  try {
    dbName = new URL(url).pathname.slice(1);
  } catch {
    return false;
  }
  return /(^|_)test(_|$)/.test(dbName);
}

export function resolveUploadDriver(): UploadDriver {
  const forced = process.env.ZARI_UPLOAD_DRIVER;
  if (forced === "memory" || forced === "blob") return forced;
  if (isTestDatabase(process.env.DATABASE_URL)) return "memory";
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) return "memory";
  return "blob";
}

/**
 * 메모리 드라이버 저장소.
 * `globalThis` 에 매달아 dev 서버의 HMR 이 모듈을 다시 평가해도 올린 파일이 사라지지 않게 한다.
 */
const memoryStore: Map<string, { body: Uint8Array; contentType: string }> = ((
  globalThis as { __zariUploadMemory?: Map<string, { body: Uint8Array; contentType: string }> }
).__zariUploadMemory ??= new Map());

/** 메모리 드라이버의 가짜 URL — 실제 private URL 과 모양을 맞춘다 */
function memoryUrl(pathname: string): string {
  return `memory://zari-demo-docs/${pathname}`;
}

/** 서류 1건 저장. private 스토어이므로 `access: "private"` 를 **명시**한다. */
export async function putDocument(input: {
  pathname: string;
  body: ArrayBuffer;
  contentType: string;
}): Promise<StoredDocument> {
  if (resolveUploadDriver() === "memory") {
    memoryStore.set(input.pathname, {
      body: new Uint8Array(input.body),
      contentType: input.contentType,
    });
    return { url: memoryUrl(input.pathname), pathname: input.pathname };
  }

  const blob = await put(input.pathname, input.body, {
    access: "private",
    contentType: input.contentType,
    // 같은 pathname 은 신청 id + 문서 id 로 유일하다. 재시도로 겹치면 덮어쓰는 편이 안전하다
    allowOverwrite: true,
  });
  return { url: blob.url, pathname: blob.pathname };
}

/**
 * 서류 1건 읽기 — 스트림을 돌려준다(버퍼링하지 않는다).
 * 없으면 `null`. **호출부는 이 함수를 부르기 직전에 권한을 확인해야 한다.**
 */
export async function getDocument(pathname: string): Promise<DocumentStream | null> {
  if (resolveUploadDriver() === "memory") {
    const entry = memoryStore.get(pathname);
    if (!entry) return null;
    const body = entry.body;
    return {
      stream: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(body);
          controller.close();
        },
      }),
      contentType: entry.contentType,
      size: body.byteLength,
    };
  }

  const result = await get(pathname, { access: "private" });
  if (!result || result.statusCode !== 200) return null;
  return {
    stream: result.stream,
    contentType: result.blob.contentType,
    size: result.blob.size,
  };
}

/** 테스트 격리용 — 메모리 드라이버 저장소를 비운다. 앱 코드에서는 부르지 않는다. */
export function resetUploadMemory(): void {
  memoryStore.clear();
}
