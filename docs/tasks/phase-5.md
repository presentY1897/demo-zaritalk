# Phase 5 — 마스터 매칭

> 선행: D4(pull 피드 vs push) 결정
> 모델: WorkOrder · WorkOrderQuote (+ Complaint 연동)

## ⬜ T5.1 작업 의뢰 생성·민원 전환

| 라우트/API | 동작 |
|---|---|
| `/landlord/workorders` | 의뢰 목록 — 직접 생성(업종·건물/호실·내용·희망일) 또는 민원 전환분. 상태: 요청→견적도착→배정→완료 |
| `GET·POST /api/work-orders` | 목록·생성, `PATCH /[id]` 완료/취소 |
| `POST /api/complaints/[id]/convert` | 민원 → 의뢰 전환(complaintId 연결, 민원 IN_PROGRESS). T2.6 스레드의 전환 버튼 활성화 |

- **완료 기준**
  - [ ] 직접 생성·민원 전환 두 경로 완주, 전환 의뢰에 민원 링크 표시
- **테스트** — 최소: 이미 전환된 민원 409(complaintId unique) · 전환 시 양쪽 상태 동기화

## ⬜ T5.2 마스터 의뢰 피드 (D4: pull 방식 제안)

| 라우트/API | 동작 |
|---|---|
| `/master` | 의뢰 피드 — 내 업종 포함 + 활동반경 내 REQUESTED 의뢰 거리순 |
| `/master/orders/[id]` | 상세 — 금액·메시지로 견적 제안(의뢰당 1회) |
| `GET /api/master/feed` | 업종+반경 매칭 피드(거리순) |

- **완료 기준**
  - [ ] 시드 마스터(성수, REPAIR·CLEANING, 5km) 피드에 행당해피빌 수리 의뢰 노출
- **테스트** — 최소: 업종 불일치 제외 · 반경 밖 제외 · REQUESTED만

## ⬜ T5.3 견적 제안·수락

| 라우트/API | 동작 |
|---|---|
| `/landlord/workorders/[id]` | 견적 비교 — 견적 카드(업체·금액·메시지), 하나 수락 → 나머지 자동 거절 → ASSIGNED. 완료 처리 시 연결 민원 RESOLVED |
| `/master/quotes` | 내 견적 목록·상태(제안/수락/거절) |
| `POST /api/work-orders/[id]/quotes` | 견적 제안(의뢰당 업체 1회) |
| `POST /api/quotes/[id]/accept` | 수락 — 트랜잭션: 수락 1 + 나머지 REJECTED + 의뢰 ASSIGNED |

- **완료 기준**
  - [ ] 견적 2개 이상 비교→수락→배정→완료→민원 해결 완주
- **테스트** — 최소(**핵심**): ①중복 견적 409 ②수락 트랜잭션 원자성(나머지 전부 REJECTED) ③ASSIGNED 후 신규 견적 거부 ④완료 시 민원 RESOLVED 연동 / 통합: **E2E(3역할 관통)** 세입자 민원→임대인 전환→마스터 피드→견적→수락→완료→세입자 해결 표시

## Phase 완료 조건

- [ ] 전 task ✅ (견적 수락 트랜잭션 단위 테스트 포함)
- [ ] E2E: 민원→작업→견적→해결 3역할 여정 green
