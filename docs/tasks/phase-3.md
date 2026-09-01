# Phase 3 — 매물·중개·통근

> 선행 조건: 카카오 디벨로퍼스 키(맵 JS+모빌리티 REST), ODsay LAB 키(사용자)

- [ ] **T3.1 매물 등록** — CRUD·사진 업로드·상태 변경 → [§7 완료 기준·테스트](../specs/07-listing-commute.md#완료-기준)
- [ ] **T3.2 지도 탐색** — bounds API + 카카오맵·스냅 시트·필터 → [§7](../specs/07-listing-commute.md#완료-기준)
- [ ] **T3.3 매물 상세 + SEO** — 상세 화면·OG·JSON-LD → [§7](../specs/07-listing-commute.md#완료-기준)
- [ ] **T3.4 근무지 관리** — CRUD + 화면 → [§7](../specs/07-listing-commute.md#완료-기준)
- [ ] **T3.5 통근시간 조회** — 캐시 upsert·ODsay/모빌리티 병렬·배지 → [§7](../specs/07-listing-commute.md#완료-기준)
- [ ] **T3.6 중개 요청·반경 매칭** — 거리순 20명 선정·미리보기·현황 → [§8 완료 기준·테스트](../specs/08-brokerage.md#완료-기준)
- [ ] **T3.7 중개인 수신함·수락** — inbox·respond·매물 등록 권한 → [§8](../specs/08-brokerage.md#완료-기준)

## Phase 완료 조건

- [ ] 전 task ✅ + §7·§8 완료 기준 전부 체크 (반경 매칭·통근 캐시 단위 테스트 포함)
- [ ] E2E: 매물 탐색 여정 / 중개 매칭 여정 green (통근은 키 있으면 포함)
