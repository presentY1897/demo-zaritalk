# Phase 0 — 기반 공사

> 스펙: [§1 인증·프로필](../specs/01-auth-profile.md) · [§12 그로스](../specs/12-growth.md) · [공통 규칙](../SPEC.md)
> 선행 조건: D1(API 스타일)·D5(웹 셸) 결정 — T0.4부터 적용

## ✅ T0.0 DB 마이그레이션·데모 시드 (완료 a29e42c)

- **내용**: prisma migrate init(29개 모델), 역할별 데모 계정 4종+어드민, 수납 시나리오(완납/부분납/연체/예정), 미가입 세입자 공개 고지서 시드
- **완료 기준**: `pnpm db:migrate` + `pnpm --filter @zari/db db:seed` 재실행 가능(전체 삭제 후 재생성) ✅
- **최소 테스트**: seed 실행 후 count 검증(스크립트 출력으로 대체) ✅
- **통합 테스트**: 없음 (이후 모든 E2E의 픽스처 역할)

## 🔨 T0.1 배포 파이프라인 (CI 완료, 계정 연결 대기)

- **내용**: GitHub Actions CI(빌드·타입체크·prisma validate) ✅ / GitHub 레포·Vercel(web+admin)·Neon 연결, 환경변수 세팅 — 사용자 액션 필요
- **완료 기준**: main push → CI green → web·admin 자동 배포, 라이브 URL에서 시드 데이터 화면 확인, Neon에 마이그레이션 적용
- **최소 테스트**: CI 파이프라인 자체가 테스트 (build+typecheck+validate)
- **통합 테스트**: 배포 URL smoke — `/`가 200, `/api/me`가 401(비로그인) 응답

## ⬜ T0.2 테스트 인프라

- **내용**: Vitest 셋업(워크스페이스 공용 config), 테스트 DB(`zari_test`) 준비 스크립트, Playwright 셋업(web 대상), CI에 test job 추가 — [D8](../DECISIONS.md#-d8-테스트-스택) 확정 후
- **완료 기준**: 예제 단위 테스트 1개 + 예제 E2E 1개(로그인 페이지 렌더)가 로컬·CI에서 통과
- **최소 테스트**: (자기 자신)
- **통합 테스트**: (자기 자신)

## ⬜ T0.3 인증 API

- **내용**: `POST /api/auth/otp/request·verify`, `demo-login`, `logout`, `GET /api/me` — 세션 httpOnly 쿠키, OTP 5분 만료, MessageLog(OTP) 기록
- **완료 기준**: 데모 계정 4종 원클릭 로그인 성공, 신규 번호 OTP 가입 → 온보딩 티켓 반환, 만료·오입력·재사용 코드 거부
- **최소 테스트**: verify 4케이스(정상/만료/오코드/재사용), demo-login 세션 발급, me의 401/200
- **통합 테스트**: demo-login → `/api/me`가 프로필 목록 반환 (E2E 픽스처 헬퍼로도 재사용)

## ⬜ T0.4 로그인·온보딩 화면

- **내용**: `/login`(전화번호→OTP 입력, 데모 코드 노출, 원클릭 버튼 4개), `/onboarding`(이름+프로필 유형 선택, 중개인·마스터 부가정보 입력)
- **완료 기준**: 신규 가입 전 플로우가 화면으로 완주 가능, 세입자 유형 선택 시 대기 계약 있으면 수락 화면으로 리다이렉트
- **최소 테스트**: 프로필 생성 API — 유형별 Detail 필수값 검증(zod), 중복 유형 409
- **통합 테스트**: **E2E ①** 원클릭 임대인 로그인 → 홈 도달 / **E2E ②** 신규 번호 OTP 가입 → 온보딩 → 세입자 프로필 생성 → 대기 계약 수락 화면 노출

## ⬜ T0.5 웹 셸 + 프로필 전환

- **내용**: 480px 모바일 셸(D5), 활성 프로필별 하단 탭바 4종, `/me` 프로필 전환 시트, `POST /api/profiles/active`(쿠키), 어드민 사이드바 셸
- **완료 기준**: 프로필 전환 시 탭바·홈이 즉시 바뀜(새로고침 없이), 비로그인 보호 라우트는 `/login` 리다이렉트
- **최소 테스트**: active 전환 API — 내 소유 아닌 프로필 id 거부(403)
- **통합 테스트**: E2E — 임대인 로그인 → 세입자 프로필 추가 → 전환 → 탭바 구성 변경 확인

## ⬜ T0.6 packages/ui 디자인 토큰

- **내용**: 자리톡 옐로 브랜드 톤(C1) 기준 PandaCSS preset — 컬러·타이포·spacing 토큰, 기본 컴포넌트(Button, Input, Sheet, Badge, Card)
- **완료 기준**: web·admin이 동일 preset을 소비, 로그인·셸 화면이 토큰만으로 스타일링됨(하드코딩 색상 0)
- **최소 테스트**: 없음 (시각 확인)
- **통합 테스트**: 없음

## ⬜ T0.7 트래킹 코어

- **내용**: anonId 1st-party 쿠키(미들웨어), `POST /api/track`(배열·sendBeacon), `useTrack()` 훅, 라우트 전환 `page_view` 자동 수집
- **완료 기준**: 아무 페이지나 이동하면 TrackingEvent에 page_view가 쌓이고, 로그인 시 userId가 연결됨
- **최소 테스트**: track API — 배열 수집, 스키마 불일치 400, anonId 없는 요청 처리
- **통합 테스트**: E2E — 로그인 여정 후 DB에 `page_view` + `signup_*` 이벤트 존재 확인

## Phase 완료 조건

- [ ] T0.1~T0.7 전부 ✅ (T0.0 완료)
- [ ] E2E 스위트: 원클릭 로그인 4종 + 신규 가입 여정 green
- [ ] 라이브 URL에서 데모 로그인 가능
