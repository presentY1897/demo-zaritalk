# Task 문서 — 목차·공통 기준

> **task 1개 = 파일 1개.** 각 task 파일은 **구현 내용(페이지·API 포함) → 완료 기준 → 테스트**가 자체 완결이라 그것만 보고 작업·검수할 수 있다.
> 왜 이렇게 만드는지(방식 선택의 배경)는 [DECISIONS.md](../DECISIONS.md), 데이터 모델은 [`schema.prisma`](../../packages/db/prisma/schema.prisma) 참조.
> 상태: ⬜ 미착수 · 🔨 진행중 · ✅ 완료 — 작업하면서 task 파일과 이 목차의 상태를 함께 갱신한다.

## 테스트 전략 ([D8](../DECISIONS.md#-d8-테스트-스택) 결정 대기)

- **최소 테스트 = Vitest 단위·API 테스트.** 순수 로직은 함수 단위, Route Handler는 Request 객체로 직접 호출. DB 필요 시 테스트 전용 DB(`zari_test`)에서 truncate 격리.
- **통합 테스트 = Playwright E2E.** Phase별 핵심 사용자 여정만, 시드 데이터 기반. CI에서 빌드 후 실행.
- **외부 API**(토스·카카오·ODsay·국토부)는 단위에서 mock. E2E는 토스 테스트모드만 실호출, 나머지는 키 없으면 skip 태그.
- 커버리지 %는 목표가 아니다. **돈·상태 전이 로직은 반드시 단위 테스트, Phase별 핵심 여정은 반드시 E2E.**

## 공통 완료 기준 (모든 task에 적용)

1. `pnpm build`·`pnpm typecheck`·`pnpm test` 통과 (CI green)
2. 시드 데이터만으로 해당 화면·API가 동작
3. 웹은 480px 모바일 셸 기준, 어드민은 데스크톱 기준 확인
4. 해당되는 경우 트래킹 이벤트(`<domain>_<object>_<action>`) 심기
5. task 상태·완료 기준 체크박스 갱신


## Phase 0 — 기반 공사

> 선행: D1(API 스타일)·D5(웹 셸)·D8(테스트 스택) 결정 — T0.2·T0.4부터 적용
> 모델: User · Session · OtpCode · Profile · RealtorDetail · MasterDetail

| task | 내용 | 상태 |
|---|---|---|
| [T0.0](./t0.0-db-seed.md) | DB 마이그레이션·데모 시드 (a29e42c) | ✅ |
| [T0.1](./t0.1-deploy.md) | 배포 파이프라인 | 🔨 |
| [T0.2](./t0.2-test-infra.md) | 테스트 인프라 (D8 확정 후) | ⬜ |
| [T0.3](./t0.3-auth-api.md) | 인증 API | ⬜ |
| [T0.4](./t0.4-login-onboarding.md) | 로그인·온보딩 화면 | ⬜ |
| [T0.5](./t0.5-shell-profile.md) | 웹 셸 + 프로필 전환 | ⬜ |
| [T0.6](./t0.6-ui-tokens.md) | packages/ui 디자인 토큰 | ⬜ |
| [T0.7](./t0.7-tracking.md) | 트래킹 코어 | ⬜ |

**Phase 완료 조건**
- [ ] 전 task ✅
- [ ] E2E: 원클릭 로그인 4종 + 신규 가입 여정 green
- [ ] 라이브 URL에서 데모 로그인 가능

## Phase 1 — 임대인 코어 (자산·계약·수납·고지)

> 모델: Building · Unit · Lease · RentCharge · RentPayment · MessageLog

| task | 내용 | 상태 |
|---|---|---|
| [T1.1](./t1.1-building-unit.md) | 건물·호실 관리 | ⬜ |
| [T1.2](./t1.2-lease.md) | 계약 등록·관리 | ⬜ |
| [T1.3](./t1.3-tenant-link.md) | 세입자 연결 | ⬜ |
| [T1.4](./t1.4-rent-engine.md) | 원장 엔진 (청구 생성·이월·연체) | ⬜ |
| [T1.5](./t1.5-rent-ui.md) | 수납 UI | ⬜ |
| [T1.6](./t1.6-ledger.md) | 임대장부 | ⬜ |
| [T1.7](./t1.7-notice-send.md) | 고지서 발송 | ⬜ |
| [T1.8](./t1.8-notice-public.md) | 공개 고지서 페이지 (그로스 핵심) | ⬜ |
| [T1.9](./t1.9-landlord-home.md) | 임대인 홈 대시보드 | ⬜ |

**Phase 완료 조건**
- [ ] 전 task ✅ (원장 엔진 단위 테스트 6개 축 포함)
- [ ] E2E: 계약 등록 / 연체 수납 / 고지서→가입 그로스 여정 green
- [ ] 라이브 시연: 임대인 로그인 → 수납 현황 → 고지서 발송 → 공개 페이지

## Phase 2 — 세입자 결제·환급·민원

> 선행: 토스페이먼츠 테스트 키(사용자), D3(업로드 저장소) 결정
> 모델: TossPayment · RentPayment · RefundApplication · Complaint · ComplaintMessage

| task | 내용 | 상태 |
|---|---|---|
| [T2.1](./t2.1-toss-api.md) | 토스 결제 API | ⬜ |
| [T2.2](./t2.2-pay-ui.md) | 결제 UI | ⬜ |
| [T2.3](./t2.3-refund-calc.md) | 환급 계산기 | ⬜ |
| [T2.4](./t2.4-refund-apply.md) | 환급 신청 | ⬜ |
| [T2.5](./t2.5-refund-review.md) | 어드민 환급 심사 큐 | ⬜ |
| [T2.6](./t2.6-complaint.md) | 민원 접수·스레드 | ⬜ |

**Phase 완료 조건**
- [ ] 전 task ✅ (결제 confirm·환급 계산 단위 테스트 포함)
- [ ] E2E: 카드결제 / 환급 심사 왕복 여정 green
- [ ] 라이브에서 토스 테스트 결제 시연 가능

## Phase 3 — 매물·중개·통근

> 선행: 카카오 디벨로퍼스 키(맵 JS+모빌리티 REST), ODsay LAB 키(사용자)
> 모델: Listing · Workplace · CommuteCache · BrokerageRequest · BrokerageTarget

| task | 내용 | 상태 |
|---|---|---|
| [T3.1](./t3.1-listing-create.md) | 매물 등록 | ⬜ |
| [T3.2](./t3.2-map-search.md) | 지도 탐색 | ⬜ |
| [T3.3](./t3.3-listing-detail.md) | 매물 상세 + SEO | ⬜ |
| [T3.4](./t3.4-workplace.md) | 근무지 관리 | ⬜ |
| [T3.5](./t3.5-commute.md) | 통근시간 조회 | ⬜ |
| [T3.6](./t3.6-brokerage-request.md) | 중개 요청·반경 매칭 | ⬜ |
| [T3.7](./t3.7-realtor-inbox.md) | 중개인 수신함·수락 | ⬜ |

**Phase 완료 조건**
- [ ] 전 task ✅ (반경 매칭·통근 캐시 단위 테스트 포함)
- [ ] E2E: 매물 탐색 / 중개 매칭 여정 green (통근은 키 있으면 포함)

## Phase 4 — 커뮤니티·실거래가

> 선행: 공공데이터포털 실거래가 키(사용자)
> 모델: Post · Comment · PostLike · Report · RealTransaction · TransactionAlert

| task | 내용 | 상태 |
|---|---|---|
| [T4.1](./t4.1-community.md) | 커뮤니티 보드 | ⬜ |
| [T4.2](./t4.2-moderation.md) | 신고·모더레이션 | ⬜ |
| [T4.3](./t4.3-deals-sync.md) | 실거래가 수집 배치 | ⬜ |
| [T4.4](./t4.4-deals-view.md) | 실거래가 조회·알림 | ⬜ |

**Phase 완료 조건**
- [ ] 전 task ✅ (페이지네이션·수집 멱등 단위 테스트 포함)
- [ ] E2E: 커뮤니티 / 신고→블라인드 여정 green

## Phase 5 — 마스터 매칭

> 선행: D4(pull 피드 vs push) 결정
> 모델: WorkOrder · WorkOrderQuote (+ Complaint 연동)

| task | 내용 | 상태 |
|---|---|---|
| [T5.1](./t5.1-workorder.md) | 작업 의뢰 생성·민원 전환 | ⬜ |
| [T5.2](./t5.2-master-feed.md) | 마스터 의뢰 피드 (D4: pull 방식 제안) | ⬜ |
| [T5.3](./t5.3-quote.md) | 견적 제안·수락 | ⬜ |

**Phase 완료 조건**
- [ ] 전 task ✅ (견적 수락 트랜잭션 단위 테스트 포함)
- [ ] E2E: 민원→작업→견적→해결 3역할 여정 green

## Phase 6 — 그로스 마무리·대시보드

> 선행: D2(A/B 소재) 결정
> 모델: TrackingEvent · AbAssignment

| task | 내용 | 상태 |
|---|---|---|
| [T6.1](./t6.1-ab-test.md) | A/B 실험 실운영 | ⬜ |
| [T6.2](./t6.2-metrics.md) | 어드민 지표 대시보드·퍼널 | ⬜ |
| [T6.3](./t6.3-admin-views.md) | 어드민 조회 화면 일괄 | ⬜ |
| [T6.4](./t6.4-seo.md) | SEO 마무리 | ⬜ |
| [T6.5](./t6.5-docs.md) | 문서·마무리 | ⬜ |

**Phase 완료 조건**
- [ ] 전 task ✅
- [ ] 전체 E2E green + 라이브 URL 최종 점검
- [ ] 데모 시나리오 대본대로 전 역할 시연 가능
