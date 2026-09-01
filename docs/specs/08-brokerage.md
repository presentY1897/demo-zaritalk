# §8 공실 중개 매칭 (임대인·중개인)

> 모델: BrokerageRequest · BrokerageTarget
> 상태: ⬜ 미착수 · [전체 목차](../SPEC.md)

## 웹 페이지

| 라우트 | 화면·기능 |
|---|---|
| `/landlord/brokerage` | 내 중개 요청 목록 — 요청별 발송 대상 수·응답 현황(열람/수락/거절), 수락 중개인 연락 카드. |
| 요청 시트 (공실 호실에서) | 메시지 작성 → **반경 내 중개인 미리보기**(몇 명에게 가는지, 지도에 사무소 위치) → 발송. |
| `/realtor` | 중개인 홈 = **요청 수신함** — 새 요청 카드(호실 정보·거리·임대인 메시지), 열람 시 VIEWED 기록. |
| `/realtor/requests/[id]` | 요청 상세 — 수락/거절. 수락 시 임대인에게 알림(MessageLog) + 해당 호실 매물 등록 권한 획득([§7](./07-listing-commute.md)). |
| `/realtor/listings` | 내가 맡은 매물 관리. |

## 매칭 규칙

1. 공실 Unit에서 요청 생성 → 건물 좌표 기준, `RealtorDetail`의 사무소 좌표+활동반경 안에 드는 중개인을 거리순 최대 20명 선정.
2. BrokerageTarget(SENT) 생성 + 중개 요청 알림톡(MessageLog) 발송.
3. 중개인 열람 → VIEWED, 수락 → ACCEPTED(복수 수락 허용), 요청은 첫 수락 시 MATCHED.

## API

| 엔드포인트 | 동작 |
|---|---|
| `POST /api/brokerage-requests` | 요청 생성 + 반경 매칭 + 타겟·알림 생성. `GET`으로 내 요청 목록. |
| `GET /api/brokerage-requests/preview?unitId=` | 발송 전 대상 중개인 수·목록 미리보기. |
| `GET /api/realtor/inbox` | 내가 받은 요청(거리 포함). |
| `POST /api/brokerage-targets/[id]/respond` | 수락/거절(respondedAt 기록). |
