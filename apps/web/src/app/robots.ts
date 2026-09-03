import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";

/**
 * `robots.txt` (T6.4).
 *
 * 공개 화면만 열고 나머지는 막는다. 특히 **`/notice/`** 는 개인 고지서라 토큰이 크롤러에
 * 잡히면 안 되고, `/api/` 는 색인 대상이 아니다. 각 화면의 `robots` 메타는 그대로 두고
 * (화면별 이유가 다르다 — `lib/seo.ts` 표 참고) 여기서는 경로 단위로 한 번 더 막는다.
 */
/**
 * 정적 생성이면 **빌드 시점** 환경변수로 Sitemap 주소가 굳어 프리뷰·로컬 빌드에서
 * localhost 가 박힌다(실제로 겪음). 요청 시점에 도메인을 읽도록 동적으로 둔다.
 */
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/notice/", // 개인 고지서 — 토큰만 알면 열린다
          "/login",
          "/onboarding",
          "/me",
          "/landlord/",
          "/tenant/",
          "/realtor/",
          "/master/",
          "/community/", // 로그인 필요(T4.1)
        ],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
