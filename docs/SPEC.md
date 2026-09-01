# 자리톡 데모 — 기능 스펙 (목차)

> 2026-09-01 기준. grill-me 세션(2026-08-31)에서 확정한 결정 위에 세운 상세 스펙이다.
> 기능별 명세는 [`docs/specs/`](./specs/)에 파일로 분리 — 각 파일이 **웹 페이지 구성 → 핵심 플로우 → 백엔드 API** 구조.
> **[제안]** 표시는 미확정 항목 — 목록은 [PLAN.md](./PLAN.md#피드백-대기)에 모아져 있다.
> 데이터 모델은 [`packages/db/prisma/schema.prisma`](../packages/db/prisma/schema.prisma) 참조.

## 아키텍처·공통 규칙

- **Next.js 풀스택** — Prisma + PostgreSQL. 프론트는 공고 스택 그대로(TS, Tanstack Query, Jotai, PandaCSS, pnpm).
- **계정 모델** — 1계정 다중 프로필(User → Profile 1:N, `@@unique([userId, type])`). 임대인·세입자·중개인·마스터 전환식, ADMIN은 `User.isAdmin`으로 별도.
- **도메인 3계층** — Building → Unit → Lease. 계약·매물·민원·작업은 호실(Unit) 단위.
- **API 스타일 [제안]** — REST형 Route Handlers로 통일(Server Actions 미사용). Tanstack Query와 궁합이 좋고, "앱 웹뷰가 쓰는 API"라는 데모 명분도 맞음. 요청·응답은 zod 4로 검증.
- **프론트 구조 [제안]** — `src/features/<domain>/{api,components,hooks}` 단위. 서버 상태는 Tanstack Query, UI·클라이언트 상태(활성 프로필, 지도 필터, 시트 열림 등)만 Jotai. 디자인 토큰·공통 컴포넌트는 `packages/ui`(PandaCSS preset).
- **웹(모바일) 셸 [제안]** — 앱 웹뷰 가정: 최대폭 480px 모바일 레이아웃 + 하단 탭바. 탭 구성은 활성 프로필 타입에 따라 변경(§1). 어드민은 데스크톱 사이드바 레이아웃.
- **금액 단위** — 원(KRW) Int. 실거래가만 API 원본 단위인 만원.

## 기능 목차

| § | 문서 | 내용 | 주요 모델 |
|---|---|---|---|
| 1 | [인증·프로필](./specs/01-auth-profile.md) | 모의 OTP, 데모 로그인, 프로필 전환, 역할별 탭바 | User · Session · OtpCode · Profile |
| 2 | [건물·호실·계약](./specs/02-lease.md) | 자산 관리, 계약 등록, 세입자 전화번호 매칭·수락 | Building · Unit · Lease |
| 3 | [수납 원장·임대장부](./specs/03-rent-ledger.md) | 월 청구 자동 생성, 부분납·이월·연체료, 장부 집계 | RentCharge · RentPayment |
| 4 | [고지서](./specs/04-notice.md) | 알림톡 시뮬레이터, 토큰 기반 공개 고지서 + 가입 CTA | MessageLog |
| 5 | [자리페이](./specs/05-zaripay.md) | 토스 테스트모드 카드결제 → 원장 자동 반영 | TossPayment |
| 6 | [월세 환급](./specs/06-refund.md) | 세액공제 계산기(5년 소급), 신청·서류·심사 | RefundApplication |
| 7 | [매물 탐색·통근시간](./specs/07-listing-commute.md) | 카카오맵 하이브리드 탐색, ODsay·모빌리티 통근 조회 | Listing · Workplace · CommuteCache |
| 8 | [공실 중개 매칭](./specs/08-brokerage.md) | 반경 내 중개인 거리순 20명 매칭, 수신함·수락 | BrokerageRequest · BrokerageTarget |
| 9 | [민원·작업의뢰](./specs/09-complaint-workorder.md) | 민원 스레드 → 작업 전환 → 마스터 견적·수락 매칭 | Complaint · WorkOrder · WorkOrderQuote |
| 10 | [커뮤니티](./specs/10-community.md) | 지역 보드, 인기글, 신고 | Post · Comment · PostLike · Report |
| 11 | [실거래가](./specs/11-real-transaction.md) | 국토부 수집·조회, 단지 추이, 알림 구독 | RealTransaction · TransactionAlert |
| 12 | [그로스](./specs/12-growth.md) | 이벤트 트래킹, A/B 1개 실운영, SEO | TrackingEvent · AbAssignment |
| 13 | [백오피스](./specs/13-admin.md) | 지표 대시보드, 환급 심사, 신고 처리, 조회 화면 | — |
| 14 | [배치·크론](./specs/14-cron.md) | 청구 생성·연체 처리, 만기 알림, 실거래가 수집 | — |

구현 순서·진행 현황은 [PLAN.md](./PLAN.md) 참조. 각 스펙 파일 상단의 `상태:` 줄로 구현 여부를 추적한다(⬜ 미착수 → 🔨 진행중 → ✅ 완료).
