"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TrackingProvider } from "@zari/ui";
import { Provider as JotaiProvider } from "jotai";
import { Suspense, useState, type ReactNode } from "react";
import { PageViewTracker } from "@/lib/tracking/page-view";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1 },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <JotaiProvider>
        <TrackingProvider>
          {/* PageViewTracker 는 useSearchParams 를 쓰므로 Suspense 경계가 필요하다(T0.7) */}
          <Suspense fallback={null}>
            <PageViewTracker />
          </Suspense>
          {children}
        </TrackingProvider>
      </JotaiProvider>
    </QueryClientProvider>
  );
}
