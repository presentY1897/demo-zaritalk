"use client";

/**
 * 라우트 전환 `page_view` 자동 수집 어댑터(T0.7).
 *
 * `@zari/ui` 는 `next` 의존성이 없어 라우터를 모른다. 그래서 Next 라우터 훅을 여기서 읽어
 * 경로 문자열로 넘긴다. 실제 전송은 `usePageViewTracking` → `TrackingProvider` 가 한다.
 *
 * **Suspense 필수**: `useSearchParams()` 는 프리렌더 시 가장 가까운 `<Suspense>` 경계까지를
 * CSR 로 떨어뜨린다. 경계가 없으면 프로덕션 빌드가 "Missing Suspense boundary with
 * useSearchParams" 로 실패한다 — `providers.tsx` 에서 `<Suspense fallback={null}>` 로 감싼다.
 */
import { usePathname, useSearchParams } from "next/navigation";
import { usePageViewTracking } from "@zari/ui";

export function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();

  usePageViewTracking(query ? `${pathname}?${query}` : pathname);

  return null;
}
