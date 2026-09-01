# Phase 0 — 기반 공사

> 선행 조건: D1(API 스타일)·D5(웹 셸)·D8(테스트 스택) 결정 — T0.2·T0.4부터 적용

- [x] **T0.0 DB 마이그레이션·데모 시드** ✅ (a29e42c) — migrate init + 역할별 계정·수납 시나리오 시드
- [ ] **T0.1 배포 파이프라인** 🔨 — CI 완료(a29e42c). 남은 것: GitHub 레포·Vercel(web+admin)·Neon 연결(사용자 액션), 환경변수
  - *완료 기준*: main push → CI green → 자동 배포, 라이브 URL에서 시드 화면 확인, Neon에 마이그레이션 적용
  - *테스트*: CI 자체(build·typecheck·validate) + 배포 URL smoke(`/` 200, `/api/me` 401)
- [ ] **T0.2 테스트 인프라** — Vitest·테스트 DB(`zari_test`)·Playwright·CI test job (D8 확정 후)
  - *완료 기준*: 예제 단위 1개 + 예제 E2E 1개가 로컬·CI에서 통과
- [ ] **T0.3 인증 API** — OTP·demo-login·세션·me → [§1 완료 기준·테스트](../specs/01-auth-profile.md#완료-기준)
- [ ] **T0.4 로그인·온보딩 화면** — `/login`·`/onboarding` → [§1](../specs/01-auth-profile.md#완료-기준)
- [ ] **T0.5 웹 셸 + 프로필 전환** — 480px 셸·역할별 탭바·전환 시트·어드민 사이드바 → [§1](../specs/01-auth-profile.md#완료-기준)
- [ ] **T0.6 packages/ui 디자인 토큰** — 자리톡 옐로 톤(C1) PandaCSS preset + 기본 컴포넌트(Button·Input·Sheet·Badge·Card)
  - *완료 기준*: web·admin이 동일 preset 소비, 로그인·셸 화면에 하드코딩 색상 0
- [ ] **T0.7 트래킹 코어** — anonId 쿠키·`/api/track`·`useTrack()`·page_view 자동 수집 → [§12 완료 기준·테스트](../specs/12-growth.md#완료-기준) 중 트래킹 항목

## Phase 완료 조건

- [ ] 전 task ✅ + [§1 완료 기준](../specs/01-auth-profile.md#완료-기준) 전부 체크
- [ ] E2E: 원클릭 로그인 4종 + 신규 가입 여정 green
- [ ] 라이브 URL에서 데모 로그인 가능
