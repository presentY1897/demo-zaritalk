/**
 * 공개 화면의 SEO 공통값 (T6.4).
 *
 * Phase 1~4 에서 화면마다 사이트 URL 을 제각각 구했다 — 어떤 곳은 `NEXT_PUBLIC_WEB_URL`,
 * 어떤 곳은 상수, 어떤 곳은 아예 없어 `metadataBase` 가 비었다. 상대 경로 OG 이미지와
 * canonical 이 배포 도메인에서만 맞고 프리뷰에서 어긋나는 원인이라 한 곳으로 모은다.
 *
 * ## robots 정책 (화면별로 이유가 다르다 — 각 task 가 정한 것을 여기 모아 둔다)
 *
 * | 화면 | 정책 | 이유 |
 * |---|---|---|
 * | `/`·`/search`·`/listings/[id]`(OPEN)·`/refund/calculator`·`/deals` | index | 개인정보 0, 검색 유입이 목적 |
 * | `/listings/[id]`(RESERVED·CLOSED) | noindex, follow | 이미 나간 매물이 검색에 남으면 안 된다 |
 * | `/notice/[token]` | noindex | **개인 고지서**다. 토큰만 알면 열리므로 색인되면 안 된다 |
 * | `(auth)`·`(protected)` 전체 | 색인 대상 아님 | 로그인 화면·개인 데이터 |
 */

/**
 * 배포 도메인.
 *
 * **`SITE_URL`(서버 전용)을 가장 먼저 본다.** `NEXT_PUBLIC_*` 는 번들러가 **빌드 시점에
 * 인라인**하므로 런타임에 바꿔 끼울 수 없다 — robots·sitemap 처럼 서버에서만 도는 것이
 * 빌드 환경의 도메인(로컬 빌드면 localhost)으로 굳는 사고가 실제로 났다.
 * 클라이언트 번들에는 `SITE_URL` 이 들어가지 않으므로 그쪽은 `NEXT_PUBLIC_*` 로 떨어진다.
 * 프리뷰 배포는 Vercel 이 넣어 주는 도메인을 쓴다.
 */
export function siteUrl(): string {
  const explicit =
    process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_WEB_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

export function siteUrlObject(): URL {
  return new URL(siteUrl());
}

/** 절대 URL — canonical·OG·sitemap 이 같은 함수를 쓴다. */
export function absoluteUrl(path: string): string {
  return new URL(path.startsWith("/") ? path : `/${path}`, `${siteUrl()}/`).toString();
}

export const SITE_NAME = "자리 데모";
export const SITE_DESCRIPTION =
  "임대인·세입자·중개인·마스터를 잇는 임대관리 데모 — 수납·고지서·매물 탐색·환급까지 한 곳에서.";

/** 색인 허용 화면의 공통 robots 값 */
export const INDEXABLE = { index: true, follow: true } as const;
/** 색인 금지(링크는 따라가도 됨) */
export const NOT_INDEXABLE = { index: false, follow: true } as const;
