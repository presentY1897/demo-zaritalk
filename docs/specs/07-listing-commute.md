# §7 매물 탐색 + 통근시간 (세입자·공개)

> 모델: Listing · Workplace · CommuteCache
> 상태: ⬜ 미착수 · [전체 목차](../SPEC.md)

## 웹 페이지

| 라우트 | 화면·기능 |
|---|---|
| `/search` | **지도+리스트 하이브리드(비로그인 허용)** — 상단 카카오맵(매물 핀 + 가격 라벨), 하단 스냅 시트에 리스트. 지도 이동 시 bounds로 재조회. 필터: 전세/월세, 보증금·월세 범위. 로그인 + 근무지 등록 시 조회된 매물 핀·카드에 **통근시간 배지**(캐시 히트분만). |
| `/listings/[id]` | 매물 상세 — 사진, 조건, 호실 정보, 위치 지도. **「내 근무지까지」** 버튼 → 근무지별 대중교통(환승 요약)·자동차 소요시간 온디맨드 조회 → 결과는 캐시되어 목록 배지로 재사용. 문의(중개인/임대인 연락 더미). SEO 메타 + 구조화 데이터. |
| `/tenant/workplaces` | 근무지 관리 — 라벨+주소 검색(좌표), 복수 등록. |
| `/landlord/units/[id]/listing` | 임대인 매물 등록·수정 — 거래유형·보증금·월세·입주가능일·사진·설명, 상태 변경(OPEN/RESERVED/CLOSED). 수락 중개인도 등록 가능([§8](./08-brokerage.md)). |

## API

| 엔드포인트 | 동작 |
|---|---|
| `GET /api/listings?bounds=&filters=` | 지도 영역 내 OPEN 매물 + (로그인 시) 통근 캐시 조인. |
| `GET /api/listings/[id]` | 상세. `POST·PATCH`는 임대인/수락 중개인 권한. |
| `POST /api/commute` | unitId+workplaceId → 캐시 확인 → 미스 시 ODsay(대중교통)·카카오모빌리티(자동차) 병렬 호출 → CommuteCache upsert 후 반환. 외부 API 실패 시 부분 결과 허용. |
| `GET·POST /api/workplaces` | 근무지 CRUD. |
