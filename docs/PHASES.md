# Phase 구성 — task 목록·완료 조건

> 구현 순서는 [D6 확정](./DECISIONS.md#-d6-phase-순서)안 그대로. task 파일 규칙은 [tasks/README.md](./tasks/README.md) 참조.
> 상태: ⬜ 미착수 · 🔨 진행중 · ✅ 완료 — task 파일과 이 표를 함께 갱신한다.

## Phase 0 — 기반 공사

> 모델: User · Session · OtpCode · Profile · RealtorDetail · MasterDetail

| task | 내용 | 상태 |
|---|---|---|
| [T0.0](./tasks/t0.0-db-seed.md) | DB 마이그레이션·데모 시드 (a29e42c) | ✅ |
| [T0.1](./tasks/t0.1-deploy.md) | 배포 파이프라인 | 🔨 |
| [T0.2](./tasks/t0.2-test-infra.md) | 테스트 인프라 | ✅ |
| [T0.3](./tasks/t0.3-auth-api.md) | 인증 API | ✅ |
| [T0.4](./tasks/t0.4-login-onboarding.md) | 로그인·온보딩 화면 | ✅ |
| [T0.5](./tasks/t0.5-shell-profile.md) | 웹 셸 + 프로필 전환 | ✅ |
| [T0.6](./tasks/t0.6-ui-tokens.md) | packages/ui 디자인 토큰 | ✅ |
| [T0.7](./tasks/t0.7-tracking.md) | 트래킹 코어 | ✅ |

**Phase 완료 조건**
- [ ] 전 task ✅ — T0.1(배포 연결)만 남음, 나머지 7개 완료
- [x] E2E: 원클릭 로그인 4종 + 신규 가입 여정 green (`e2e/auth.spec.ts`, 전체 10 spec green)
- [ ] 라이브 URL에서 데모 로그인 가능 — T0.1 대기

## Phase 1 — 임대인 코어 (자산·계약·수납·고지)

> 모델: Building · Unit · Lease · RentCharge · RentPayment · MessageLog

| task | 내용 | 상태 |
|---|---|---|
| [T1.1](./tasks/t1.1-building-unit.md) | 건물·호실 관리 | ⬜ |
| [T1.2](./tasks/t1.2-lease.md) | 계약 등록·관리 | ⬜ |
| [T1.3](./tasks/t1.3-tenant-link.md) | 세입자 연결 | ⬜ |
| [T1.4](./tasks/t1.4-rent-engine.md) | 원장 엔진 (청구 생성·이월·연체) | ⬜ |
| [T1.5](./tasks/t1.5-rent-ui.md) | 수납 UI | ⬜ |
| [T1.6](./tasks/t1.6-ledger.md) | 임대장부 | ⬜ |
| [T1.7](./tasks/t1.7-notice-send.md) | 고지서 발송 | ⬜ |
| [T1.8](./tasks/t1.8-notice-public.md) | 공개 고지서 페이지 (그로스 핵심) | ⬜ |
| [T1.9](./tasks/t1.9-landlord-home.md) | 임대인 홈 대시보드 | ⬜ |

**Phase 완료 조건**
- [ ] 전 task ✅ (원장 엔진 단위 테스트 6개 축 포함)
- [ ] E2E: 계약 등록 / 연체 수납 / 고지서→가입 그로스 여정 green
- [ ] 라이브 시연: 임대인 로그인 → 수납 현황 → 고지서 발송 → 공개 페이지

## Phase 2 — 세입자 결제·환급·민원

> 선행: 토스페이먼츠 테스트 키(사용자)
> 모델: TossPayment · RentPayment · RefundApplication · Complaint · ComplaintMessage

| task | 내용 | 상태 |
|---|---|---|
| [T2.1](./tasks/t2.1-toss-api.md) | 토스 결제 API | ⬜ |
| [T2.2](./tasks/t2.2-pay-ui.md) | 결제 UI | ⬜ |
| [T2.3](./tasks/t2.3-refund-calc.md) | 환급 계산기 | ⬜ |
| [T2.4](./tasks/t2.4-refund-apply.md) | 환급 신청 | ⬜ |
| [T2.5](./tasks/t2.5-refund-review.md) | 어드민 환급 심사 큐 | ⬜ |
| [T2.6](./tasks/t2.6-complaint.md) | 민원 접수·스레드 | ⬜ |

**Phase 완료 조건**
- [ ] 전 task ✅ (결제 confirm·환급 계산 단위 테스트 포함)
- [ ] E2E: 카드결제 / 환급 심사 왕복 여정 green
- [ ] 라이브에서 토스 테스트 결제 시연 가능

## Phase 3 — 매물·중개·통근

> 선행: 카카오 디벨로퍼스 키(맵 JS+모빌리티 REST), ODsay LAB 키(사용자)
> 모델: Listing · Workplace · CommuteCache · BrokerageRequest · BrokerageTarget

| task | 내용 | 상태 |
|---|---|---|
| [T3.1](./tasks/t3.1-listing-create.md) | 매물 등록 | ⬜ |
| [T3.2](./tasks/t3.2-map-search.md) | 지도 탐색 | ⬜ |
| [T3.3](./tasks/t3.3-listing-detail.md) | 매물 상세 + SEO | ⬜ |
| [T3.4](./tasks/t3.4-workplace.md) | 근무지 관리 | ⬜ |
| [T3.5](./tasks/t3.5-commute.md) | 통근시간 조회 | ⬜ |
| [T3.6](./tasks/t3.6-brokerage-request.md) | 중개 요청·반경 매칭 | ⬜ |
| [T3.7](./tasks/t3.7-realtor-inbox.md) | 중개인 수신함·수락 | ⬜ |

**Phase 완료 조건**
- [ ] 전 task ✅ (반경 매칭·통근 캐시 단위 테스트 포함)
- [ ] E2E: 매물 탐색 / 중개 매칭 여정 green (통근은 키 있으면 포함)

## Phase 4 — 커뮤니티·실거래가

> 선행: 공공데이터포털 실거래가 키(사용자)
> 모델: Post · Comment · PostLike · Report · RealTransaction · TransactionAlert

| task | 내용 | 상태 |
|---|---|---|
| [T4.1](./tasks/t4.1-community.md) | 커뮤니티 보드 | ⬜ |
| [T4.2](./tasks/t4.2-moderation.md) | 신고·모더레이션 | ⬜ |
| [T4.3](./tasks/t4.3-deals-sync.md) | 실거래가 수집 배치 | ⬜ |
| [T4.4](./tasks/t4.4-deals-view.md) | 실거래가 조회·알림 | ⬜ |

**Phase 완료 조건**
- [ ] 전 task ✅ (페이지네이션·수집 멱등 단위 테스트 포함)
- [ ] E2E: 커뮤니티 / 신고→블라인드 여정 green

## Phase 5 — 마스터 매칭

> 모델: WorkOrder · WorkOrderQuote · WorkOrderTarget · MasterDetail.plan (+ Complaint 연동)

| task | 내용 | 상태 |
|---|---|---|
| [T5.1](./tasks/t5.1-workorder.md) | 작업 의뢰 생성·민원 전환 | ⬜ |
| [T5.2](./tasks/t5.2-master-feed.md) | 마스터 의뢰 피드 — pull + 유료 push 추천 | ⬜ |
| [T5.3](./tasks/t5.3-quote.md) | 견적 제안·수락 | ⬜ |

**Phase 완료 조건**
- [ ] 전 task ✅ (견적 수락 트랜잭션 단위 테스트 포함)
- [ ] E2E: 민원→작업→견적→해결 3역할 여정 green

## Phase 6 — 그로스 마무리·대시보드

> 모델: TrackingEvent · AbAssignment

| task | 내용 | 상태 |
|---|---|---|
| [T6.1](./tasks/t6.1-ab-test.md) | A/B 실험 실운영 | ⬜ |
| [T6.2](./tasks/t6.2-metrics.md) | 어드민 지표 대시보드·퍼널 | ⬜ |
| [T6.3](./tasks/t6.3-admin-views.md) | 어드민 조회 화면 일괄 | ⬜ |
| [T6.4](./tasks/t6.4-seo.md) | SEO 마무리 | ⬜ |
| [T6.5](./tasks/t6.5-docs.md) | 문서·마무리 | ⬜ |

**Phase 완료 조건**
- [ ] 전 task ✅
- [ ] 전체 E2E green + 라이브 URL 최종 점검
- [ ] 데모 시나리오 대본대로 전 역할 시연 가능
