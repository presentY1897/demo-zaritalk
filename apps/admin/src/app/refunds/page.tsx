import { fetchRefundQueue } from "./actions";
import { RefundReviewView } from "./RefundReviewView";
import { DEFAULT_FILTER, resolveFilter } from "./shared";

/**
 * `/refunds` — 환급 심사 큐 (T2.5). 메뉴 자리는 T0.5 가 잡아 뒀다.
 *
 * 서버에서 web API 를 한 번 읽어 화면에 넘긴다(어드민에는 로그인이 없어 브라우저가 직접
 * 부를 수 없다 — `actions.ts` 주석 참고). 필터는 `?filter=` 쿼리라 새로고침·공유가 된다.
 *
 * `NEXT_PUBLIC_WEB_URL`·시크릿을 요청 시점에 읽어야 배포 환경변수를 바꿔도 바로 반영된다
 * (크론 화면과 같은 이유로 `force-dynamic`).
 *
 * `searchParams` 는 Next 16 규약대로 Promise 다.
 */
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function RefundsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const raw = params.filter;
  const key = (Array.isArray(raw) ? raw[0] : raw) ?? DEFAULT_FILTER;
  const filter = resolveFilter(key);

  const queue = await fetchRefundQueue(filter.statuses);

  return <RefundReviewView filterKey={filter.key} queue={queue} />;
}
