# Phase 5 — 마스터 매칭

> 스펙: [§9 민원·작업의뢰](../specs/09-complaint-workorder.md)
> 선행 조건: D4(pull 피드 vs push) 결정

## ⬜ T5.1 작업 의뢰 생성·민원 전환

- **내용**: work-orders CRUD + `/landlord/workorders`(직접 생성), `POST /api/complaints/[id]/convert`(민원→의뢰, 민원 IN_PROGRESS), 민원 스레드에 전환 버튼 활성화
- **완료 기준**: 직접 생성·민원 전환 두 경로 모두 완주, 전환된 의뢰에 민원 링크 표시
- **최소 테스트**: convert — 이미 전환된 민원 409(`complaintId` unique), 전환 시 양쪽 상태 동기화
- **통합 테스트**: (T5.3과 묶음)

## ⬜ T5.2 마스터 의뢰 피드

- **내용**: `GET /api/master/feed` — 내 업종 포함 + 활동반경 내 REQUESTED 의뢰 거리순, `/master` 홈 피드, `/master/orders/[id]` 상세
- **완료 기준**: 시드 마스터(성수, REPAIR·CLEANING, 5km)에게 행당해피빌 수리 의뢰가 피드에 노출
- **최소 테스트**: 매칭 필터 — 업종 불일치 제외, 반경 밖 제외, REQUESTED만
- **통합 테스트**: (T5.3과 묶음)

## ⬜ T5.3 견적 제안·수락

- **내용**: `POST /api/work-orders/[id]/quotes`(의뢰당 업체 1회), `POST /api/quotes/[id]/accept`(트랜잭션: 수락 1 + 나머지 REJECTED + 의뢰 ASSIGNED), `/master/quotes`, `/landlord/workorders/[id]` 견적 비교, 완료 처리 시 연결 민원 RESOLVED
- **완료 기준**: 견적 2개 이상 비교→수락→배정→완료→민원 해결까지 완주
- **최소 테스트**: **매칭 핵심.** ①중복 견적 409 ②수락 트랜잭션 원자성(나머지 전부 REJECTED) ③ASSIGNED 후 신규 견적 거부 ④완료 시 민원 RESOLVED 연동
- **통합 테스트**: **E2E** 세입자 민원 → 임대인 작업 전환 → 마스터 피드 확인 → 견적 제안 → 임대인 수락 → 완료 → 세입자 민원 해결 표시 (3역할 관통 여정)

## Phase 완료 조건

- [ ] T5.1~T5.3 전부 ✅
- [ ] 견적 수락 트랜잭션 단위 테스트 green
- [ ] E2E: 민원→작업→견적→해결 3역할 여정 green
