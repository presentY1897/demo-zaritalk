# 자리톡 데모 — 기능 스펙

> 2026-09-01 기준. grill-me 세션(2026-08-31)에서 확정한 결정 위에 세운 상세 스펙이다.
> **[제안]** 표시는 스펙 작성 과정에서 새로 정한 미확정 항목 — 목록은 [PLAN.md](./PLAN.md#피드백-대기)에 모아져 있다.
> 데이터 모델은 [`packages/db/prisma/schema.prisma`](../packages/db/prisma/schema.prisma) 참조.

## 아키텍처·공통 규칙

- **Next.js 풀스택** — Prisma + PostgreSQL. 프론트는 공고 스택 그대로(TS, Tanstack Query, Jotai, PandaCSS, pnpm).
- **계정 모델** — 1계정 다중 프로필(User → Profile 1:N, `@@unique([userId, type])`). 임대인·세입자·중개인·마스터 전환식, ADMIN은 `User.isAdmin`으로 별도.
- **도메인 3계층** — Building → Unit → Lease. 계약·매물·민원·작업은 호실(Unit) 단위.
- **API 스타일 [제안]** — REST형 Route Handlers로 통일(Server Actions 미사용). Tanstack Query와 궁합이 좋고, "앱 웹뷰가 쓰는 API"라는 데모 명분도 맞음. 요청·응답은 zod 4로 검증.
- **프론트 구조 [제안]** — `src/features/<domain>/{api,components,hooks}` 단위. 서버 상태는 Tanstack Query, UI·클라이언트 상태(활성 프로필, 지도 필터, 시트 열림 등)만 Jotai. 디자인 토큰·공통 컴포넌트는 `packages/ui`(PandaCSS preset).
- **웹(모바일) 셸 [제안]** — 앱 웹뷰 가정: 최대폭 480px 모바일 레이아웃 + 하단 탭바. 탭 구성은 활성 프로필 타입에 따라 변경(§1). 어드민은 데스크톱 사이드바 레이아웃.
- **금액 단위** — 원(KRW) Int. 실거래가만 API 원본 단위인 만원.

각 기능은 **웹 페이지 구성 → 핵심 플로우 → 백엔드 API** 순서로 정리했다. 어드민 화면은 §13, 배치 작업은 §14에 모았다.

---

## 1. 인증·프로필·내비게이션

> 모델: User · Session · OtpCode · Profile · RealtorDetail · MasterDetail

### 웹 페이지

| 라우트 | 화면·기능 |
|---|---|
| `/login` | 전화번호 입력 → 모의 OTP 6자리 입력. 데모라 발급된 코드를 화면에 그대로 노출. 하단에 **역할별 원클릭 데모 로그인** 버튼 4개(임대인·세입자·중개인·마스터 시드 계정). |
| `/onboarding` | 최초 가입 시 이름 입력 + 프로필 유형 선택. 중개인은 사무소명·주소(좌표)·활동반경, 마스터는 업체명·업종(복수)·활동반경 추가 입력. 세입자 유형 선택 시 전화번호 매칭되는 대기 계약이 있으면 바로 수락 화면(§2)으로. |
| `/me` | 마이페이지 — 프로필 전환 시트(보유 프로필 목록 + 새 유형 추가), 내 정보, 근무지 관리 진입(세입자), 로그아웃. |

하단 탭바는 활성 프로필에 따라 구성:

- **임대인** 홈 · 자산 · 중개요청 · 커뮤니티 · 마이
- **세입자** 홈 · 매물 · 환급 · 커뮤니티 · 마이
- **중개인** 홈(수신함) · 매물 · 커뮤니티 · 마이
- **마스터** 홈(의뢰피드) · 견적 · 커뮤니티 · 마이

활성 프로필 id는 Jotai atom + 쿠키로 유지.

### API

| 엔드포인트 | 동작 |
|---|---|
| `POST /api/auth/otp/request` | OtpCode 생성(5분 만료). 응답에 코드 포함(데모 노출용) + MessageLog(OTP) 기록. |
| `POST /api/auth/otp/verify` | 코드 검증 → 기존 User면 Session 발급(httpOnly 쿠키), 신규면 가입 티켓 반환 → 온보딩으로. |
| `POST /api/auth/demo-login` | 시드 계정 4종 중 하나로 즉시 세션 발급. |
| `POST /api/auth/logout` | 세션 삭제. |
| `GET /api/me` | 내 User + 프로필 목록 + 활성 프로필. |
| `POST /api/profiles` | 프로필 추가(유형별 Detail 포함). `PATCH /api/profiles/[id]`로 수정. |
| `POST /api/profiles/active` | 활성 프로필 전환(쿠키 갱신). |

---

## 2. 건물·호실·계약 + 세입자 연결 (임대인·세입자)

> 모델: Building · Unit · Lease

### 웹 페이지

| 라우트 | 화면·기능 |
|---|---|
| `/landlord` | 임대인 홈 대시보드 — 이번 달 수납 현황(납부/미납/연체 건수·금액), 연체 계약 리스트, 만기 3개월 이내 계약 알림 카드, 미확인 민원·견적 배지. |
| `/landlord/buildings` | 건물 목록(호실 수·공실 수 요약). 추가 시 카카오 주소 검색 → 좌표 저장. |
| `/landlord/buildings/[id]` | 건물 상세 — 호실 그리드(계약중/공실/연체 상태 색), 호실 추가·수정. |
| `/landlord/units/[id]` | 호실 상세 — 현재 계약 카드, 과거 계약 이력, 공실이면 「매물 등록」·「중개 요청」 버튼(§7·§8). |
| `/landlord/leases/new` | 계약 등록 — 호실 선택, 세입자 이름·전화번호, 보증금·월세·관리비·납부일·기간·연체이율. 등록 즉시 세입자 연결 대기(PENDING_TENANT) 상태. |
| `/landlord/leases/[id]` | 계약 상세 — 조건 요약, 세입자 연결 상태, 수납 원장 진입(§3), 고지서 발송(§4), 계약 종료 처리. |
| `/tenant/leases/accept` | **세입자 연결 수락** — 내 전화번호로 걸린 대기 계약 목록 → 조건 확인 → 수락/거절. 수락 시 ACTIVE 전환. |
| `/tenant` | 세입자 홈 — 내 계약 카드(주소·조건), 이번 달 납부 상태 + 「자리페이로 결제」 버튼, 환급 예상액 배너(그로스 소재), 민원 진입. |

### 핵심 플로우 — 세입자 연결

1. 임대인이 계약 등록(세입자 전화번호 포함) → `Lease.status = PENDING_TENANT`.
2. 세입자가 같은 번호로 가입/로그인하면 `tenantPhone` 매칭 계약을 홈·온보딩에서 노출.
3. 세입자 수락 → `tenantProfileId` 연결, `tenantAcceptedAt` 기록, ACTIVE 전환 → 이후 청구·고지·결제가 세입자 화면에도 흐름.

### API

| 엔드포인트 | 동작 |
|---|---|
| `GET·POST /api/buildings` | 내 건물 목록·생성. `PATCH·DELETE /api/buildings/[id]`. |
| `POST /api/buildings/[id]/units` | 호실 추가. `GET·PATCH /api/units/[id]` — 상세엔 현재 계약·매물·수납 요약 포함. |
| `GET·POST /api/leases` | 계약 목록·등록. 등록 시 당월분 RentCharge 즉시 생성. |
| `GET·PATCH /api/leases/[id]` | 상세·수정·종료(ENDED). |
| `GET /api/tenant/pending-leases` | 내 전화번호로 매칭되는 대기 계약. |
| `POST /api/leases/[id]/accept` | 세입자 수락(거절은 `/decline`). |
| `GET /api/landlord/summary` | 홈 대시보드 집계(수납 현황·연체·만기 임박). |

---

## 3. 수납 원장·임대장부 (임대인)

> 모델: RentCharge · RentPayment

### 웹 페이지

| 라우트 | 화면·기능 |
|---|---|
| `/landlord/leases/[id]` (수납 탭) | 월별 청구 리스트 — 각 행: 청구 내역(월세+관리비+이월+연체료), 납부액, 상태 배지(예정/부분납/완납/연체). 행 탭 → 청구 상세 시트. |
| 청구 상세 시트 | 납부 기록 타임라인, **「받음 체크」**(수동, 금액 입력 가능 → 부분납부), **「가상 입금 시뮬레이션」**(데모: 입금자명·금액 입력 → 즉시 반영), 고지서 재발송. |
| `/landlord/ledger` | **임대장부** — 월별/연별 수입 자동 집계(월세·관리비·연체료 구분), 건물별 필터, 월 비교 미니 차트. 자동 작성이 포인트: 별도 입력 없이 원장에서 파생. |

### 원장 규칙

- 매일 크론(§14)이 ACTIVE 계약의 당월 청구를 생성. `totalDue = 월세 + 관리비 + 전월 이월 + 연체료`.
- 납부(수동·가상·카드)는 전부 RentPayment 행으로 쌓고 `paidAmount`에 누적 — 0 < 납부 < totalDue면 PARTIALLY_PAID, 도달 시 PAID.
- 납부일 경과 시 OVERDUE 전환. 미납 잔액은 익월 청구의 `carriedOverAmount`로 이월, `lateFeeRatePct` 있으면 연체료 일할 가산.

### API

| 엔드포인트 | 동작 |
|---|---|
| `GET /api/leases/[id]/charges` | 계약의 청구 목록(납부 기록 포함). |
| `POST /api/charges/[id]/payments` | 납부 기록 추가 — `method: MANUAL_CHECK \| VIRTUAL_TRANSFER`, 금액·메모. 상태 재계산. |
| `DELETE /api/payments/[id]` | 오기록 취소(상태 재계산). |
| `GET /api/landlord/ledger?year=` | 장부 집계 — 월×건물 matrix, 항목별 합계. |

---

## 4. 고지서 — 알림톡 시뮬레이터 + 공개 페이지 (그로스 핵심)

> 모델: MessageLog

### 웹 페이지

| 라우트 | 화면·기능 |
|---|---|
| 발송 시트 (계약·청구 상세에서) | 고지서 종류 선택(월세 고지/연체 알림/만기 임박) → **카톡 말풍선 스타일 미리보기**(알림톡 실물 레이아웃 모사) → 발송. 발송 = MessageLog 생성이며 실제 SMS는 없음을 UI에 명시. |
| `/landlord/messages` | 발송 이력 — 수신번호·종류·발송시각·**열람 여부**(openedAt). 열람률이 그로스 지표 소재. |
| `/notice/[token]` | **공개 고지서 페이지(로그인 불필요)** — 청구 내역 상세(월세·관리비·이월·연체료), 납부 계좌 안내(더미), 임대인 메시지. 하단 **「자리톡으로 월세 관리하기」 가입 CTA** — A/B 실험 대상(§12). 첫 오픈 시 openedAt 기록. OG 태그·SEO 메타 구성. |

### API

| 엔드포인트 | 동작 |
|---|---|
| `POST /api/leases/[id]/notices` | 고지서 발송 — kind·대상 청구 지정, 본문 템플릿 렌더, token 발급, MessageLog 생성. |
| `GET /api/notices/[token]` | 공개 고지서 데이터(비로그인). 첫 조회 시 openedAt 기록 + `notice_view` 트래킹. |
| `GET /api/landlord/messages` | 내 발송 이력. |

---

## 5. 자리페이 — 월세 카드결제 (세입자)

> 모델: TossPayment · RentPayment

### 웹 페이지

| 라우트 | 화면·기능 |
|---|---|
| `/tenant/pay/[chargeId]` | 결제 페이지 — 청구 내역 확인 + **토스페이먼츠 결제위젯**(테스트모드, 카드·간편결제 UI). 부분납부 시 잔액만 결제. |
| `/tenant/pay/success` `/tenant/pay/fail` | 토스 리다이렉트 수신 — success에서 승인 API 호출 후 결과 표시(영수증 요약, 원장 반영 확인). fail은 사유 표시 + 재시도. |
| `/tenant/payments` | 내 납부 이력(카드/기타 구분). |

### 결제 플로우

1. 결제 페이지 진입 → `POST /api/toss/checkout`으로 orderId 발급(TossPayment READY, 금액 = 청구 잔액).
2. 토스 위젯 결제 → successUrl로 paymentKey·orderId·amount 리다이렉트.
3. `POST /api/toss/confirm` — 서버에서 금액 위변조 검증 후 토스 승인 API 호출 → DONE.
4. 같은 트랜잭션에서 RentPayment(CARD) 생성 → 청구 상태 재계산 → **임대인 원장에 즉시 반영**.

### API

| 엔드포인트 | 동작 |
|---|---|
| `POST /api/toss/checkout` | orderId 발급 + TossPayment(READY) 생성. |
| `POST /api/toss/confirm` | 금액 검증 → 토스 승인 → DONE + RentPayment 반영. 실패 시 FAILED 기록. |
| `POST /api/toss/webhook` | 상태 변경 웹훅 수신(취소 등) — raw 저장 후 상태 동기화. |

---

## 6. 월세 환급 — 계산기·신청·심사 (세입자)

> 모델: RefundApplication

### 웹 페이지

| 라우트 | 화면·기능 |
|---|---|
| `/refund/calculator` | **환급 계산기(비로그인 허용 — SEO·유입 소재)** — 연 총급여·월세·거주 기간 입력 → 연도별 공제율 적용, 5년 소급 합산 예상 환급액. 결과 화면에 「신청하기」 CTA(비로그인이면 가입 유도). |
| `/tenant/refund/apply` | 신청 폼 — 내 계약 자동 채움(또는 수동 입력), 소급 기간 선택, 서류 업로드(계약서·주민등록등본 슬롯, 데모는 파일 저장 + 메타 기록). 임시저장(DRAFT) → 제출(SUBMITTED). |
| `/tenant/refund` | 신청 현황 — 상태 스테퍼(제출→심사중→보완요청/승인/반려→완료), 보완 요청 시 서류 추가 업로드, 심사 코멘트 표시. |

계산 규칙: 월세 세액공제 기준(총급여 5,500만원 이하 17%, 5,500~8,000만원 15%, 공제 대상 월세 연 1,000만원 한도)을 연도별 상수 테이블로 관리 — 데모 명시용이며 실제 세법 자문 아님을 화면에 표기.

### API

| 엔드포인트 | 동작 |
|---|---|
| `POST /api/refund/calculate` | 입력 → 연도별 산출 내역 + 합계(비로그인 허용, 결과는 저장 안 함). |
| `GET·POST /api/refunds` | 내 신청 목록·생성(DRAFT). `PATCH /api/refunds/[id]` 수정, `POST /[id]/submit` 제출. |
| `POST /api/uploads` | 서류 업로드 — Vercel Blob 저장 **[제안]**, 메타를 documents(Json)에 기록. |

---

## 7. 매물 탐색 + 통근시간 (세입자·공개)

> 모델: Listing · Workplace · CommuteCache

### 웹 페이지

| 라우트 | 화면·기능 |
|---|---|
| `/search` | **지도+리스트 하이브리드(비로그인 허용)** — 상단 카카오맵(매물 핀 + 가격 라벨), 하단 스냅 시트에 리스트. 지도 이동 시 bounds로 재조회. 필터: 전세/월세, 보증금·월세 범위. 로그인 + 근무지 등록 시 조회된 매물 핀·카드에 **통근시간 배지**(캐시 히트분만). |
| `/listings/[id]` | 매물 상세 — 사진, 조건, 호실 정보, 위치 지도. **「내 근무지까지」** 버튼 → 근무지별 대중교통(환승 요약)·자동차 소요시간 온디맨드 조회 → 결과는 캐시되어 목록 배지로 재사용. 문의(중개인/임대인 연락 더미). SEO 메타 + 구조화 데이터. |
| `/tenant/workplaces` | 근무지 관리 — 라벨+주소 검색(좌표), 복수 등록. |
| `/landlord/units/[id]/listing` | 임대인 매물 등록·수정 — 거래유형·보증금·월세·입주가능일·사진·설명, 상태 변경(OPEN/RESERVED/CLOSED). 수락 중개인도 등록 가능(§8). |

### API

| 엔드포인트 | 동작 |
|---|---|
| `GET /api/listings?bounds=&filters=` | 지도 영역 내 OPEN 매물 + (로그인 시) 통근 캐시 조인. |
| `GET /api/listings/[id]` | 상세. `POST·PATCH`는 임대인/수락 중개인 권한. |
| `POST /api/commute` | unitId+workplaceId → 캐시 확인 → 미스 시 ODsay(대중교통)·카카오모빌리티(자동차) 병렬 호출 → CommuteCache upsert 후 반환. 외부 API 실패 시 부분 결과 허용. |
| `GET·POST /api/workplaces` | 근무지 CRUD. |

---

## 8. 공실 중개 매칭 (임대인·중개인)

> 모델: BrokerageRequest · BrokerageTarget

### 웹 페이지

| 라우트 | 화면·기능 |
|---|---|
| `/landlord/brokerage` | 내 중개 요청 목록 — 요청별 발송 대상 수·응답 현황(열람/수락/거절), 수락 중개인 연락 카드. |
| 요청 시트 (공실 호실에서) | 메시지 작성 → **반경 내 중개인 미리보기**(몇 명에게 가는지, 지도에 사무소 위치) → 발송. |
| `/realtor` | 중개인 홈 = **요청 수신함** — 새 요청 카드(호실 정보·거리·임대인 메시지), 열람 시 VIEWED 기록. |
| `/realtor/requests/[id]` | 요청 상세 — 수락/거절. 수락 시 임대인에게 알림(MessageLog) + 해당 호실 매물 등록 권한 획득. |
| `/realtor/listings` | 내가 맡은 매물 관리. |

### 매칭 규칙

1. 공실 Unit에서 요청 생성 → 건물 좌표 기준, `RealtorDetail`의 사무소 좌표+활동반경 안에 드는 중개인을 거리순 최대 20명 선정.
2. BrokerageTarget(SENT) 생성 + 중개 요청 알림톡(MessageLog) 발송.
3. 중개인 열람 → VIEWED, 수락 → ACCEPTED(복수 수락 허용), 요청은 첫 수락 시 MATCHED.

### API

| 엔드포인트 | 동작 |
|---|---|
| `POST /api/brokerage-requests` | 요청 생성 + 반경 매칭 + 타겟·알림 생성. `GET`으로 내 요청 목록. |
| `GET /api/brokerage-requests/preview?unitId=` | 발송 전 대상 중개인 수·목록 미리보기. |
| `GET /api/realtor/inbox` | 내가 받은 요청(거리 포함). |
| `POST /api/brokerage-targets/[id]/respond` | 수락/거절(respondedAt 기록). |

---

## 9. 민원 → 작업 의뢰 → 마스터 매칭 (세입자·임대인·마스터)

> 모델: Complaint · ComplaintMessage · WorkOrder · WorkOrderQuote

### 웹 페이지

| 라우트 | 화면·기능 |
|---|---|
| `/tenant/complaints` | 내 민원 목록·접수 — 제목·내용·사진 첨부, 상태 표시. |
| `/tenant/complaints/[id]` `/landlord/complaints/[id]` | 민원 스레드 — 세입자·임대인 메시지 교환, 상태 변경(임대인: 진행중/해결/반려). 임대인 화면엔 **「작업 의뢰로 전환」** 버튼. |
| `/landlord/workorders` | 작업 의뢰 목록 — 직접 생성(업종·건물/호실·내용·희망일) 또는 민원 전환분. 상태: 요청→견적도착→배정→완료. |
| `/landlord/workorders/[id]` | **견적 비교** — 도착한 견적 카드(업체·금액·메시지), 하나 수락 → 나머지 자동 거절, ASSIGNED. 완료 처리 → 연결된 민원도 RESOLVED. |
| `/master` | 마스터 홈 = **의뢰 피드**(pull 방식 **[제안]**) — 내 업종 + 활동반경 내 REQUESTED 의뢰를 거리순 노출. |
| `/master/orders/[id]` | 의뢰 상세 — 금액·메시지로 **견적 제안**(의뢰당 1회). |
| `/master/quotes` | 내 견적 목록·상태(제안/수락/거절). |

### API

| 엔드포인트 | 동작 |
|---|---|
| `GET·POST /api/complaints` | 민원 목록·접수. `POST /[id]/messages` 스레드, `PATCH /[id]` 상태. |
| `POST /api/complaints/[id]/convert` | 작업 의뢰로 전환(WorkOrder 생성, complaintId 연결, 민원 IN_PROGRESS). |
| `GET·POST /api/work-orders` | 의뢰 목록·생성. `PATCH /[id]` 완료/취소. |
| `GET /api/master/feed` | 업종+반경 매칭 의뢰 피드(거리순). |
| `POST /api/work-orders/[id]/quotes` | 견적 제안. `POST /api/quotes/[id]/accept` 수락(트랜잭션: 나머지 REJECTED + ASSIGNED). |

---

## 10. 커뮤니티 (전 역할)

> 모델: Post · Comment · PostLike · Report

### 웹 페이지

| 라우트 | 화면·기능 |
|---|---|
| `/community` | 지역 보드 — 상단 지역 선택(시군구), 탭: 최신순/인기순(likeCount). 무한 스크롤(커서 페이지네이션). 글쓴이는 프로필 유형 배지(임대인/세입자…)로 표시. |
| `/community/write` | 글 작성 — 지역·제목·본문. |
| `/community/[postId]` | 글 상세 — 조회수, 좋아요 토글, 댓글 작성·삭제, 글·댓글 신고(사유 입력). 신고·삭제된 글은 블라인드 처리 표시. |

### API

| 엔드포인트 | 동작 |
|---|---|
| `GET·POST /api/posts` | 목록(region+sort+cursor)·작성. `GET·PATCH·DELETE /[id]` — 조회 시 viewCount 증가. |
| `POST·DELETE /api/posts/[id]/like` | 좋아요 토글(likeCount 비정규화 갱신). |
| `GET·POST /api/posts/[id]/comments` | 댓글 목록·작성. `DELETE /api/comments/[id]`. |
| `POST /api/reports` | 글/댓글 신고 → 백오피스 큐(§13). |

---

## 11. 실거래가 (전 역할)

> 모델: RealTransaction · TransactionAlert

### 웹 페이지

| 라우트 | 화면·기능 |
|---|---|
| `/deals` | 실거래가 조회 — 시군구 선택 + 매매/전세/월세 탭, 최근 거래 리스트(단지·면적·층·금액·거래일), 단지명 검색. 단지 탭 → 해당 단지 거래 추이 미니 차트. |
| 알림 설정 시트 | 지역(+단지, 거래유형) 단위 **실거래가 알림 구독** — 새 거래 수집 시 알림톡 시뮬 발송. 구독 목록 관리. |

### API

| 엔드포인트 | 동작 |
|---|---|
| `GET /api/deals?lawdCd=&type=&cursor=` | 수집분 조회(캐시 우선). 해당 지역 미수집이면 온디맨드 수집 트리거. |
| `POST /api/deals/sync` | 국토부 API 월별 수집 → upsert. 크론·온디맨드 공용(§14). |
| `GET·POST·DELETE /api/transaction-alerts` | 알림 구독 CRUD. |

---

## 12. 그로스 — 이벤트 트래킹·A/B·SEO (공고 직결)

> 모델: TrackingEvent · AbAssignment

- **트래킹** — 1st-party 쿠키 anonId. 라우트 전환 시 `page_view` 자동 수집 + 명시 이벤트는 `<domain>_<object>_<action>` 네이밍(예: `notice_cta_click`, `pay_widget_open`). 클라이언트 SDK는 `packages/ui`에 훅으로(`useTrack()`), 전송은 sendBeacon.
- **A/B 실험 1개 실운영 [제안]** — `notice_cta`: 공개 고지서 페이지(§4)의 가입 CTA 문구·배치 2안. 미가입자 대상이라 그로스 스토리가 가장 좋음. anonId 단위 고정 배정(해시), 퍼널: `notice_view → notice_cta_click → signup_start → signup_complete`.
- **SEO** — 공개 페이지(고지서·매물 상세·환급 계산기)에 메타·OG·구조화 데이터, sitemap.

### API

| 엔드포인트 | 동작 |
|---|---|
| `POST /api/track` | 이벤트 수집(배열 허용, sendBeacon 대응, 로그인 시 userId 연결). |
| `GET /api/ab/[experimentKey]` | 변형 배정 조회/생성(anonId 고정 배정). |

---

## 13. 백오피스 (apps/admin, 데스크톱)

로그인: `User.isAdmin` 계정만(같은 OTP 인증 + 데모 어드민 원클릭). 사이드바 레이아웃, 전 화면 서버 페이지네이션·필터.

| 라우트 | 화면·기능 |
|---|---|
| `/` | **지표 대시보드** — 가입자·DAU 추이(TrackingEvent 기반), 수납률(청구 대비 납부, 월별), 고지서 발송·열람률, 결제액 추이, 환급 신청 파이프라인 현황, **A/B 퍼널 차트**(notice_cta 변형별 전환율). |
| `/refunds` | **환급 심사 큐** — 상태 필터(제출/심사중/보완요청), 상세: 신청 정보·산출 내역·서류 뷰어, 액션: 심사시작/승인/반려/보완요청(코멘트 필수) → 상태 변경 시 세입자에게 알림톡 시뮬. |
| `/reports` | **신고 처리** — 대기 신고 목록, 대상 글/댓글 미리보기, 액션: 블라인드(soft delete)/기각. 처리자·시각 기록. |
| `/messages` | 발송 이력 전체 — 종류·수신자 필터, 열람 여부, 본문 미리보기(알림톡 스타일). |
| `/users` | 회원 조회 — 검색(이름·전화), 상세: 프로필들·계약·신청 이력 타임라인. |
| `/leases` `/charges` | 계약·수납 조회 — 상태 필터, 연체 계약 드릴다운. |
| `/events` | 이벤트 로그 탐색 — 이름·기간 필터, 시간대별 카운트 차트. |

어드민 API는 `/api/admin/*` 네임스페이스로 분리, isAdmin 미들웨어 가드. 대시보드 집계는 각 1개 엔드포인트(`/api/admin/metrics/overview`, `/funnel`)로 묶음.

---

## 14. 배치·크론 (Vercel Cron)

| 작업 | 주기·동작 |
|---|---|
| 청구 생성·연체 처리 | 매일 — ACTIVE 계약의 당월 청구 생성(멱등), 납부일 경과분 OVERDUE 전환, 이월·연체료 반영. 데모 시연용으로 어드민에서 수동 트리거 버튼도 제공. |
| 만기 임박 알림 | 매일 — 만기 90일 전 계약에 CONTRACT_EXPIRY 알림톡 시뮬 1회 발송. |
| 실거래가 수집 | 매일 — 알림 구독·최근 조회 지역의 당월 데이터 수집 → 신규 거래 시 구독자에게 알림. |
