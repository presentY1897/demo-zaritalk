# Phase 3 — 매물·중개·통근

> 선행: 카카오 디벨로퍼스 키(맵 JS+모빌리티 REST), ODsay LAB 키(사용자)
> 모델: Listing · Workplace · CommuteCache · BrokerageRequest · BrokerageTarget

## ⬜ T3.1 매물 등록

| 라우트/API | 동작 |
|---|---|
| `/landlord/units/[id]/listing` | 거래유형(전세/월세)·보증금·월세·입주가능일·사진·설명, 상태 변경(OPEN/RESERVED/CLOSED). 수락 중개인도 등록 가능(T3.7) |
| `POST·PATCH /api/listings` | 등록·수정 — 임대인/수락 중개인 권한 |

- **완료 기준**
  - [ ] 공실 호실에서 등록 → OPEN, 상태 변경 반영
- **테스트** — 최소: 권한(소유 임대인·수락 중개인만) · 계약중 호실 409

## ⬜ T3.2 지도 탐색

| 라우트/API | 동작 |
|---|---|
| `/search` | **비로그인 허용** — 상단 카카오맵(핀+가격 라벨) + 하단 스냅 시트 리스트, 지도 이동 시 bounds 재조회, 필터(전세/월세·보증금·월세 범위). 로그인+근무지 등록 시 핀·카드에 통근 배지(캐시 히트분) |
| `GET /api/listings?bounds=&filters=` | 영역 내 OPEN 매물 + (로그인 시) 통근 캐시 조인 |

- **완료 기준**
  - [ ] 지도 이동·필터가 리스트와 동기화, 비로그인 접근
- **테스트** — 최소: bounds 영역 내/외 정확성 · OPEN만 · 필터 조합 / 통합: **E2E** 매물 등록→`/search` 핀·리스트 노출→상세 진입

## ⬜ T3.3 매물 상세 + SEO

| 라우트/API | 동작 |
|---|---|
| `/listings/[id]` | 사진·조건·호실 정보·위치 지도·문의(더미), 「내 근무지까지」 버튼(T3.5), 메타·OG·JSON-LD |
| `GET /api/listings/[id]` | 상세 |

- **완료 기준**
  - [ ] 비로그인 접근, OG·JSON-LD 유효

## ⬜ T3.4 근무지 관리

| 라우트/API | 동작 |
|---|---|
| `/tenant/workplaces` | 라벨+주소 검색(좌표), 복수 등록 |
| `GET·POST /api/workplaces` | CRUD |

- **완료 기준**
  - [ ] 등록한 근무지가 통근 조회 기준점으로 노출
- **테스트** — 최소: 좌표 범위 검증 · 본인 프로필 것만 CRUD

## ⬜ T3.5 통근시간 조회

- **전략**: (호실, 근무지) 쌍 단위 캐시. 상세에서 온디맨드 조회 → CommuteCache upsert → 목록·핀 배지로 재사용

| 엔드포인트 | 동작 |
|---|---|
| `POST /api/commute` | 캐시 확인 → 미스 시 ODsay(대중교통)·카카오모빌리티(자동차) 병렬 호출 → upsert. 한쪽 실패 시 부분 결과 허용 |

- **완료 기준**
  - [ ] 상세 조회 결과가 목록 배지로 재사용, 부분 실패에도 표시
- **테스트** — 최소(**핵심**, 외부 mock): ①캐시 히트 시 외부 호출 없음 ②미스 시 upsert ③한쪽 실패→부분 결과 저장 ④양쪽 실패→에러·캐시 미생성 / 통합: **E2E** 근무지 등록→상세 조회→목록 배지(키 없으면 skip)

## ⬜ T3.6 중개 요청·반경 매칭

- **매칭 규칙**: ①공실 Unit에서 요청 → 건물 좌표 기준 `RealtorDetail` 사무소 좌표+활동반경 내 중개인 거리순 최대 20명 ②BrokerageTarget(SENT) 생성 + 알림톡 시뮬 발송 ③열람 VIEWED → 수락 ACCEPTED(복수 허용), 첫 수락 시 요청 MATCHED

| 라우트/API | 동작 |
|---|---|
| 요청 시트(공실 호실) | 메시지 작성 → 반경 내 중개인 미리보기(인원·지도) → 발송 |
| `/landlord/brokerage` | 내 요청 목록 — 대상 수·응답 현황(열람/수락/거절), 수락 중개인 연락 카드 |
| `POST /api/brokerage-requests` | 요청 생성 + 반경 매칭 + 타겟·알림 생성, `GET` 목록 |
| `GET /api/brokerage-requests/preview?unitId=` | 발송 전 대상 미리보기 |

- **완료 기준**
  - [ ] 시드 중개인(왕십리 3km)이 행당해피빌 요청 대상에 포함, 발송→현황 표시
- **테스트** — 최소(**핵심**): ①하버사인 거리 ②반경 밖 제외 ③21명+ 시 거리순 20명 컷 ④대상 유니크

## ⬜ T3.7 중개인 수신함·수락

| 라우트/API | 동작 |
|---|---|
| `/realtor` | 수신함 — 새 요청 카드(호실·거리·메시지), 열람 시 VIEWED |
| `/realtor/requests/[id]` | 상세 — 수락/거절. 수락 시 임대인 알림 + 해당 호실 매물 등록 권한 |
| `/realtor/listings` | 내가 맡은 매물 관리 |
| `GET /api/realtor/inbox` | 받은 요청(거리 포함) |
| `POST /api/brokerage-targets/[id]/respond` | 수락/거절(respondedAt) |

- **완료 기준**
  - [ ] 열람 VIEWED → 수락 → 임대인 알림 + 매물 등록 권한, 첫 수락 시 MATCHED
- **테스트** — 최소: respond 상태 전이(SENT→VIEWED→ACCEPTED/DECLINED만) · 타 중개인 타겟 403 / 통합: **E2E** 요청→수신함→수락→매물 등록→`/search` 노출

## Phase 완료 조건

- [ ] 전 task ✅ (반경 매칭·통근 캐시 단위 테스트 포함)
- [ ] E2E: 매물 탐색 / 중개 매칭 여정 green (통근은 키 있으면 포함)
