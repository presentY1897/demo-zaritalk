# §3 수납 원장·임대장부 (임대인)

> 모델: RentCharge · RentPayment
> 상태: ⬜ 미착수 · [전체 목차](../SPEC.md)

## 웹 페이지

| 라우트 | 화면·기능 |
|---|---|
| `/landlord/leases/[id]` (수납 탭) | 월별 청구 리스트 — 각 행: 청구 내역(월세+관리비+이월+연체료), 납부액, 상태 배지(예정/부분납/완납/연체). 행 탭 → 청구 상세 시트. |
| 청구 상세 시트 | 납부 기록 타임라인, **「받음 체크」**(수동, 금액 입력 가능 → 부분납부), **「가상 입금 시뮬레이션」**(데모: 입금자명·금액 입력 → 즉시 반영), 고지서 재발송. |
| `/landlord/ledger` | **임대장부** — 월별/연별 수입 자동 집계(월세·관리비·연체료 구분), 건물별 필터, 월 비교 미니 차트. 자동 작성이 포인트: 별도 입력 없이 원장에서 파생. |

## 원장 규칙

- 매일 크론([§14](./14-cron.md))이 ACTIVE 계약의 당월 청구를 생성. `totalDue = 월세 + 관리비 + 전월 이월 + 연체료`.
- 납부(수동·가상·카드)는 전부 RentPayment 행으로 쌓고 `paidAmount`에 누적 — 0 < 납부 < totalDue면 PARTIALLY_PAID, 도달 시 PAID.
- 납부일 경과 시 OVERDUE 전환. 미납 잔액은 익월 청구의 `carriedOverAmount`로 이월, `lateFeeRatePct` 있으면 연체료 일할 가산.

## API

| 엔드포인트 | 동작 |
|---|---|
| `GET /api/leases/[id]/charges` | 계약의 청구 목록(납부 기록 포함). |
| `POST /api/charges/[id]/payments` | 납부 기록 추가 — `method: MANUAL_CHECK \| VIRTUAL_TRANSFER`, 금액·메모. 상태 재계산. |
| `DELETE /api/payments/[id]` | 오기록 취소(상태 재계산). |
| `GET /api/landlord/ledger?year=` | 장부 집계 — 월×건물 matrix, 항목별 합계. |
