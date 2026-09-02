/**
 * 실거래가 테스트 픽스처 (T4.3·T4.4) — **테스트에서만 import 한다**(앱 코드에서 쓰지 않는다).
 *
 * ## fixture 는 **실호출로 받아 둔 진짜 응답**이다
 *
 * `./fixtures/*.xml` 은 2026-09-02 에 국토부 API 를 실제로 불러 받은 원문을 그대로 저장한 것이다.
 * 손으로 만든 XML 로 테스트하면 "우리가 상상한 응답" 만 통과하므로, 실제 응답의 함정
 * (콤마 섞인 금액 · 공백 한 칸짜리 빈 값 · **내용이 똑같은 중복 행** · `<items/>` 자기닫음)을
 * 그대로 물려받게 했다.
 *
 * | 파일 | 무엇 |
 * |---|---|
 * | `rent-11200-202607.xml` | 성동구 2026-07 아파트 전월세 30건(실호출) — 중복 행 포함 |
 * | `trade-11200-202607.xml` | 성동구 2026-07 아파트 매매 20건(실호출) |
 * | `empty.xml` | 결과 0건 — `<items/>` + `totalCount 0`(실호출: 없는 달) |
 * | `fault-service-key.xml` | 키 오류 봉투(실호출: HTTP 403 + `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`) |
 * | `edge-cases.xml` | 손으로 만든 경계값 — 콤마·지하층·엔티티·빈 값·필수값 누락 |
 * | `trade-cancelled.xml` | 손으로 만든 해제 거래(`cdealType=O`) 1건 + 정상 1건 |
 */
import { readFileSync } from "node:fs";
import { vi } from "vitest";
import { prisma, RealDealType, type RealTransaction } from "@zari/db";
import { utcDate } from "@/lib/rent";
import { MOLIT_ENDPOINTS } from "./molit";
import type { MolitEndpointKey } from "./parse";
import type { RealDealTypeValue } from "./types";

/** fixture XML 을 문자열로 읽는다 */
export function readDealFixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}.xml`, import.meta.url), "utf8");
}

export type MolitStub = { status?: number; xml: string };
/** 요청 URL 을 보고 응답을 고르고 싶을 때(월별로 다른 fixture 등) */
export type MolitStubPlan = MolitStub | MolitStub[] | ((url: URL) => MolitStub);
export type MolitCall = { url: URL; endpoint: MolitEndpointKey | "UNKNOWN" };

function endpointOf(url: URL): MolitEndpointKey | "UNKNOWN" {
  if (url.href.startsWith(MOLIT_ENDPOINTS.TRADE)) return "TRADE";
  if (url.href.startsWith(MOLIT_ENDPOINTS.RENT)) return "RENT";
  return "UNKNOWN";
}

/**
 * 국토부 호출을 통째로 가로챈다. 엔드포인트별로 응답을 정해 두고, 배열이면 호출 순서대로
 * 꺼내 쓴다(마지막 값을 계속 재사용한다 — 페이지네이션 루프에서 무한 대기하지 않게).
 *
 * 돌려주는 배열에 실제 요청 URL 이 쌓이므로 **파라미터 조립(이중 인코딩 여부)** 까지 검사할 수 있다.
 */
export function mockMolitFetch(plan: {
  TRADE?: MolitStubPlan;
  RENT?: MolitStubPlan;
}): MolitCall[] {
  const calls: MolitCall[] = [];
  const cursors: Record<string, number> = { TRADE: 0, RENT: 0 };

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: URL | RequestInfo) => {
      const url = input instanceof URL ? input : new URL(String(input));
      const endpoint = endpointOf(url);
      calls.push({ url, endpoint });

      const entry = endpoint === "UNKNOWN" ? undefined : plan[endpoint];
      if (!entry) return new Response("", { status: 404 });

      const stub =
        typeof entry === "function"
          ? entry(url)
          : (() => {
              const list = Array.isArray(entry) ? entry : [entry];
              const index = Math.min(cursors[endpoint] ?? 0, list.length - 1);
              cursors[endpoint] = (cursors[endpoint] ?? 0) + 1;
              return list[index]!;
            })();
      return new Response(stub.xml, { status: stub.status ?? 200 });
    }),
  );

  return calls;
}

/** 네트워크 자체가 죽은 상황 */
export function mockMolitNetworkError(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new TypeError("fetch failed");
    }),
  );
}

export type RealTransactionOverrides = {
  lawdCd?: string;
  dealType?: RealDealTypeValue;
  aptName?: string;
  areaM2?: number;
  floor?: number | null;
  /** `[year, month, day]` — UTC 자정으로 들어간다 */
  dealDate?: [number, number, number];
  price?: number | null;
  deposit?: number | null;
  monthlyRent?: number | null;
  builtYear?: number | null;
  fetchedAt?: Date;
};

/** 수집분 한 줄 — 조회·커서·추이 테스트가 국토부를 부르지 않고 쓰는 씨앗 */
export function createRealTransaction(
  overrides: RealTransactionOverrides = {},
): Promise<RealTransaction> {
  const [year, month, day] = overrides.dealDate ?? [2026, 7, 14];
  const dealType = overrides.dealType ?? "SALE";
  return prisma.realTransaction.create({
    data: {
      lawdCd: overrides.lawdCd ?? "11200",
      dealType: RealDealType[dealType],
      aptName: overrides.aptName ?? "신금호파크자이",
      areaM2: overrides.areaM2 ?? 59.98,
      floor: overrides.floor === undefined ? 11 : overrides.floor,
      dealDate: utcDate(year, month, day),
      price: overrides.price === undefined ? (dealType === "SALE" ? 120_000 : null) : overrides.price,
      deposit:
        overrides.deposit === undefined ? (dealType === "SALE" ? null : 85_000) : overrides.deposit,
      monthlyRent:
        overrides.monthlyRent === undefined
          ? dealType === "WOLSE"
            ? 250
            : dealType === "JEONSE"
              ? 0
              : null
          : overrides.monthlyRent,
      builtYear: overrides.builtYear === undefined ? 2016 : overrides.builtYear,
      ...(overrides.fetchedAt ? { fetchedAt: overrides.fetchedAt } : {}),
    },
  });
}
