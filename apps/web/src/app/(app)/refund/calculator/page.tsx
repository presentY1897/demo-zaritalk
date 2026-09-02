import type { Metadata } from "next";
import { defaultRefundPeriod } from "@/features/refund/calc";
import { REFUND_CALCULATOR_PATH } from "@/features/refund/cta";
import { RefundCalculatorView } from "@/features/refund/RefundCalculatorView";
import { retroYearRange } from "@/features/refund/rules";
import { currentUser } from "@/features/shell/session";
import { formatDateKey, kstToday } from "@/lib/rent";

/**
 * `/refund/calculator` — **비로그인 공개** 월세 환급 계산기 (T2.3).
 *
 * ## 왜 `(app)` 바로 아래인가 (route group)
 *
 * 로그인 강제는 `(app)/(protected)/layout.tsx` **한 곳**이 한다(T0.5). 그 그룹 **밖**,
 * 즉 `(app)` 바로 아래에 두면 **480px 셸(D5)은 그대로 쓰면서 로그인은 걸리지 않는다** —
 * 공개 고지서 `(app)/notice/[token]`(T1.8)이 같은 자리에 있고, T0.5 가 `/search`·
 * `/refund/calculator` 를 그렇게 두기로 이미 정해 뒀다. `(auth)` 는 로그인·온보딩 전용
 * 레이아웃이라 여기 두면 안 된다. 비로그인 방문자에게는 탭바가 그려지지 않는다
 * (`AppShell` 은 프로필이 없으면 탭바를 뺀다).
 *
 * ## 서버가 하는 일은 셋뿐
 *
 * 1. **소급 기준일** — `kstToday()`. "오늘"을 클라이언트가 만들면 하이드레이션이 갈리고,
 *    무엇보다 계산이 시계에 의존하면 안 된다(계산 함수는 `asOf` 를 인자로 받는다).
 * 2. **로그인 여부** — CTA 목적지만 바꾼다(`features/refund/cta.ts`). 화면 내용은 같다.
 * 3. **SEO·OG 메타** — 아래 `generateMetadata`.
 *
 * 계산 자체는 `POST /api/refund/calculate` 가 하고, 화면과 API 는 **같은 순수 함수**
 * (`features/refund/calc.ts`)를 쓴다.
 *
 * ## SEO — 공개 고지서(T1.8)와 정반대로 **색인을 연다**
 *
 * 고지서에는 이름·호실·금액 같은 개인정보가 있어 `noindex` 였다. 이 화면에는 개인정보가
 * 한 줄도 없고, 오히려 "월세 환급 계산기"는 검색 유입 자체가 목적인 그로스 경로다.
 *
 * 메타는 `generateMetadata` 함수가 아니라 **정적 `metadata` 객체**로 둔다 — 값이
 * 요청 정보(params·쿠키)에 전혀 의존하지 않기 때문이다. Next 문서가 그 경우에는 정적
 * 객체를 쓰라고 못박는다(`03-api-reference/04-functions/generate-metadata.md`).
 * T1.8 이 함수를 쓴 이유는 토큰별로 제목·설명이 달라지기 때문이고, 여기는 그렇지 않다.
 */

const SITE_NAME = "자리 데모";
const metadataBase = new URL(process.env.NEXT_PUBLIC_WEB_URL || "http://localhost:3000");

const TITLE = "월세 환급 계산기 — 최근 5년 세액공제 소급 조회";
const DESCRIPTION =
  "연 총급여와 월세, 임차 기간만 넣으면 월세 세액공제로 돌려받을 금액을 연도별로 계산합니다. 최근 5년까지 소급, 총급여 5,500만원 이하 17% · 8,000만원 이하 15% 기준. 데모용 추정치이며 실제 세법 자문이 아닙니다.";

export const metadata: Metadata = {
  metadataBase,
  title: `${TITLE} · ${SITE_NAME}`,
  description: DESCRIPTION,
  keywords: ["월세 세액공제", "월세 환급", "연말정산", "경정청구", "월세 공제 계산기"],
  alternates: { canonical: REFUND_CALCULATOR_PATH },
  // 개인정보가 없는 공개 유입 경로다 — 고지서(T1.8)와 달리 색인을 연다
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "ko_KR",
    url: REFUND_CALCULATOR_PATH,
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

export default async function RefundCalculatorPage() {
  const asOf = kstToday();
  const user = await currentUser();

  // 계산에 쓰는 "오늘"은 전부 이 한 값에서 나온다 — 화면·API·테스트가 같은 규칙을 본다
  return (
    <RefundCalculatorView
      loggedIn={Boolean(user)}
      asOf={formatDateKey(asOf)}
      retroRange={retroYearRange(asOf)}
      defaultPeriod={defaultRefundPeriod(asOf)}
    />
  );
}
