import type { MetadataRoute } from "next";
import { prisma } from "@zari/db";
import { absoluteUrl } from "@/lib/seo";

/**
 * `sitemap.xml` (T6.4).
 *
 * 고정 공개 화면 + **OPEN 매물 상세**만 싣는다. 예약·종료 매물은 상세 페이지가 스스로
 * `noindex` 라 넣으면 서로 어긋나고, `/notice/[token]` 은 개인 고지서라 애초에 제외한다.
 * DB 를 읽으므로 요청 시점에 만든다(매물이 늘면 그대로 반영된다).
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), changeFrequency: "weekly", priority: 1 },
    { url: absoluteUrl("/search"), changeFrequency: "hourly", priority: 0.9 },
    { url: absoluteUrl("/deals"), changeFrequency: "daily", priority: 0.7 },
    { url: absoluteUrl("/refund/calculator"), changeFrequency: "monthly", priority: 0.8 },
  ];

  let listings: { id: string; updatedAt: Date }[] = [];
  try {
    listings = await prisma.listing.findMany({
      where: { status: "OPEN" },
      select: { id: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 1000,
    });
  } catch {
    // DB 가 없거나 막혀도 sitemap 자체는 나가야 한다 — 고정 화면만이라도 알린다.
  }

  return [
    ...staticEntries,
    ...listings.map((listing) => ({
      url: absoluteUrl(`/listings/${listing.id}`),
      lastModified: listing.updatedAt,
      changeFrequency: "daily" as const,
      priority: 0.6,
    })),
  ];
}
