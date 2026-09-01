# §11 실거래가 (전 역할)

> 모델: RealTransaction · TransactionAlert
> 상태: ⬜ 미착수 · [전체 목차](../SPEC.md)

## 웹 페이지

| 라우트 | 화면·기능 |
|---|---|
| `/deals` | 실거래가 조회 — 시군구 선택 + 매매/전세/월세 탭, 최근 거래 리스트(단지·면적·층·금액·거래일), 단지명 검색. 단지 탭 → 해당 단지 거래 추이 미니 차트. |
| 알림 설정 시트 | 지역(+단지, 거래유형) 단위 **실거래가 알림 구독** — 새 거래 수집 시 알림톡 시뮬 발송. 구독 목록 관리. |

## API

| 엔드포인트 | 동작 |
|---|---|
| `GET /api/deals?lawdCd=&type=&cursor=` | 수집분 조회(캐시 우선). 해당 지역 미수집이면 온디맨드 수집 트리거. |
| `POST /api/deals/sync` | 국토부 API 월별 수집 → upsert. 크론·온디맨드 공용([§14](./14-cron.md)). |
| `GET·POST·DELETE /api/transaction-alerts` | 알림 구독 CRUD. |

금액 단위 주의: RealTransaction만 API 원본 단위인 **만원**(나머지 도메인은 원).
