# §9 민원 → 작업 의뢰 → 마스터 매칭 (세입자·임대인·마스터)

> 모델: Complaint · ComplaintMessage · WorkOrder · WorkOrderQuote
> 상태: ⬜ 미착수 · [전체 목차](../SPEC.md)

## 웹 페이지

| 라우트 | 화면·기능 |
|---|---|
| `/tenant/complaints` | 내 민원 목록·접수 — 제목·내용·사진 첨부, 상태 표시. |
| `/tenant/complaints/[id]` `/landlord/complaints/[id]` | 민원 스레드 — 세입자·임대인 메시지 교환, 상태 변경(임대인: 진행중/해결/반려). 임대인 화면엔 **「작업 의뢰로 전환」** 버튼. |
| `/landlord/workorders` | 작업 의뢰 목록 — 직접 생성(업종·건물/호실·내용·희망일) 또는 민원 전환분. 상태: 요청→견적도착→배정→완료. |
| `/landlord/workorders/[id]` | **견적 비교** — 도착한 견적 카드(업체·금액·메시지), 하나 수락 → 나머지 자동 거절, ASSIGNED. 완료 처리 → 연결된 민원도 RESOLVED. |
| `/master` | 마스터 홈 = **의뢰 피드**(pull 방식 **[제안]**) — 내 업종 + 활동반경 내 REQUESTED 의뢰를 거리순 노출. |
| `/master/orders/[id]` | 의뢰 상세 — 금액·메시지로 **견적 제안**(의뢰당 1회). |
| `/master/quotes` | 내 견적 목록·상태(제안/수락/거절). |

## API

| 엔드포인트 | 동작 |
|---|---|
| `GET·POST /api/complaints` | 민원 목록·접수. `POST /[id]/messages` 스레드, `PATCH /[id]` 상태. |
| `POST /api/complaints/[id]/convert` | 작업 의뢰로 전환(WorkOrder 생성, complaintId 연결, 민원 IN_PROGRESS). |
| `GET·POST /api/work-orders` | 의뢰 목록·생성. `PATCH /[id]` 완료/취소. |
| `GET /api/master/feed` | 업종+반경 매칭 의뢰 피드(거리순). |
| `POST /api/work-orders/[id]/quotes` | 견적 제안. `POST /api/quotes/[id]/accept` 수락(트랜잭션: 나머지 REJECTED + ASSIGNED). |

## 완료 기준

- [ ] 민원: 세입자 접수 → 임대인 홈 배지 → 스레드 왕복 → 해결 처리 완주
- [ ] 작업 의뢰: 직접 생성·민원 전환 두 경로 완주, 전환된 의뢰에 민원 링크 표시
- [ ] 시드 마스터(성수, REPAIR·CLEANING, 5km) 피드에 행당해피빌 수리 의뢰 노출
- [ ] 견적 비교 → 수락 → 배정 → 완료 → 연결 민원 RESOLVED까지 완주

## 테스트

- **최소(단위·API)**: 스레드 권한 — 해당 계약의 세입자·임대인만(제3자 403) · convert — 이미 전환된 민원 409(complaintId unique)·양쪽 상태 동기화 · 피드 매칭 — 업종 불일치 제외·반경 밖 제외·REQUESTED만 · 견적(핵심) — ①중복 견적 409 ②수락 트랜잭션 원자성(나머지 전부 REJECTED) ③ASSIGNED 후 신규 견적 거부 ④완료 시 민원 RESOLVED 연동
- **통합(E2E — 3역할 관통)**: 세입자 민원 → 임대인 작업 전환 → 마스터 피드 → 견적 제안 → 임대인 수락 → 완료 → 세입자 민원 해결 표시
