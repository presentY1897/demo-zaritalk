# §2 건물·호실·계약 + 세입자 연결 (임대인·세입자)

> 모델: Building · Unit · Lease
> 상태: ⬜ 미착수 · [전체 목차](../SPEC.md)

## 웹 페이지

| 라우트 | 화면·기능 |
|---|---|
| `/landlord` | 임대인 홈 대시보드 — 이번 달 수납 현황(납부/미납/연체 건수·금액), 연체 계약 리스트, 만기 3개월 이내 계약 알림 카드, 미확인 민원·견적 배지. |
| `/landlord/buildings` | 건물 목록(호실 수·공실 수 요약). 추가 시 카카오 주소 검색 → 좌표 저장. |
| `/landlord/buildings/[id]` | 건물 상세 — 호실 그리드(계약중/공실/연체 상태 색), 호실 추가·수정. |
| `/landlord/units/[id]` | 호실 상세 — 현재 계약 카드, 과거 계약 이력, 공실이면 「매물 등록」([§7](./07-listing-commute.md))·「중개 요청」([§8](./08-brokerage.md)) 버튼. |
| `/landlord/leases/new` | 계약 등록 — 호실 선택, 세입자 이름·전화번호, 보증금·월세·관리비·납부일·기간·연체이율. 등록 즉시 세입자 연결 대기(PENDING_TENANT) 상태. |
| `/landlord/leases/[id]` | 계약 상세 — 조건 요약, 세입자 연결 상태, 수납 원장 진입([§3](./03-rent-ledger.md)), 고지서 발송([§4](./04-notice.md)), 계약 종료 처리. |
| `/tenant/leases/accept` | **세입자 연결 수락** — 내 전화번호로 걸린 대기 계약 목록 → 조건 확인 → 수락/거절. 수락 시 ACTIVE 전환. |
| `/tenant` | 세입자 홈 — 내 계약 카드(주소·조건), 이번 달 납부 상태 + 「자리페이로 결제」 버튼, 환급 예상액 배너(그로스 소재), 민원 진입. |

## 핵심 플로우 — 세입자 연결

1. 임대인이 계약 등록(세입자 전화번호 포함) → `Lease.status = PENDING_TENANT`.
2. 세입자가 같은 번호로 가입/로그인하면 `tenantPhone` 매칭 계약을 홈·온보딩에서 노출.
3. 세입자 수락 → `tenantProfileId` 연결, `tenantAcceptedAt` 기록, ACTIVE 전환 → 이후 청구·고지·결제가 세입자 화면에도 흐름.

## API

| 엔드포인트 | 동작 |
|---|---|
| `GET·POST /api/buildings` | 내 건물 목록·생성. `PATCH·DELETE /api/buildings/[id]`. |
| `POST /api/buildings/[id]/units` | 호실 추가. `GET·PATCH /api/units/[id]` — 상세엔 현재 계약·매물·수납 요약 포함. |
| `GET·POST /api/leases` | 계약 목록·등록. 등록 시 당월분 RentCharge 즉시 생성. |
| `GET·PATCH /api/leases/[id]` | 상세·수정·종료(ENDED). |
| `GET /api/tenant/pending-leases` | 내 전화번호로 매칭되는 대기 계약. |
| `POST /api/leases/[id]/accept` | 세입자 수락(거절은 `/decline`). |
| `GET /api/landlord/summary` | 홈 대시보드 집계(수납 현황·연체·만기 임박). |
