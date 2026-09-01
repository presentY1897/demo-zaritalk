# §5 자리페이 — 월세 카드결제 (세입자)

> 모델: TossPayment · RentPayment
> 상태: ⬜ 미착수 · [전체 목차](../SPEC.md)

## 웹 페이지

| 라우트 | 화면·기능 |
|---|---|
| `/tenant/pay/[chargeId]` | 결제 페이지 — 청구 내역 확인 + **토스페이먼츠 결제위젯**(테스트모드, 카드·간편결제 UI). 부분납부 시 잔액만 결제. |
| `/tenant/pay/success` `/tenant/pay/fail` | 토스 리다이렉트 수신 — success에서 승인 API 호출 후 결과 표시(영수증 요약, 원장 반영 확인). fail은 사유 표시 + 재시도. |
| `/tenant/payments` | 내 납부 이력(카드/기타 구분). |

## 결제 플로우

1. 결제 페이지 진입 → `POST /api/toss/checkout`으로 orderId 발급(TossPayment READY, 금액 = 청구 잔액).
2. 토스 위젯 결제 → successUrl로 paymentKey·orderId·amount 리다이렉트.
3. `POST /api/toss/confirm` — 서버에서 금액 위변조 검증 후 토스 승인 API 호출 → DONE.
4. 같은 트랜잭션에서 RentPayment(CARD) 생성 → 청구 상태 재계산 → **임대인 원장에 즉시 반영**([§3](./03-rent-ledger.md)).

## API

| 엔드포인트 | 동작 |
|---|---|
| `POST /api/toss/checkout` | orderId 발급 + TossPayment(READY) 생성. |
| `POST /api/toss/confirm` | 금액 검증 → 토스 승인 → DONE + RentPayment 반영. 실패 시 FAILED 기록. |
| `POST /api/toss/webhook` | 상태 변경 웹훅 수신(취소 등) — raw 저장 후 상태 동기화. |
