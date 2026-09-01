# Phase 0 — 기반 공사

> 선행: D1(API 스타일)·D5(웹 셸)·D8(테스트 스택) 결정 — T0.2·T0.4부터 적용
> 모델: User · Session · OtpCode · Profile · RealtorDetail · MasterDetail

## ✅ T0.0 DB 마이그레이션·데모 시드 (a29e42c)

- prisma migrate init(29개 모델) + `pnpm --filter @zari/db db:seed`
- 시드: 데모 계정(김임대/박세입/이중개/최마스/관리자), 행당해피빌 3호실, 수납 시나리오(6월 완납·7월 부분납·8월 연체·9월 예정), 미가입 세입자 공개 고지서(token `demo-notice-hong`)
- **완료 기준**: ✅ 재실행 가능(전체 삭제 후 재생성), count 출력 검증

## 🔨 T0.1 배포 파이프라인

- **내용**: GitHub Actions CI(build·typecheck·prisma validate) ✅ / 남은 것 — GitHub 레포·Vercel(web+admin)·Neon 연결, 환경변수 세팅(사용자 액션 필요)
- **완료 기준**
  - [ ] main push → CI green → web·admin 자동 배포
  - [ ] 라이브 URL에서 시드 데이터 화면 확인, Neon에 마이그레이션 적용
- **테스트**: CI 자체 + 배포 URL smoke(`/` 200, `/api/me` 401)

## ⬜ T0.2 테스트 인프라 (D8 확정 후)

- **내용**: Vitest 공용 설정, 테스트 DB(`zari_test`) 준비 스크립트, Playwright(web 대상), CI test job
- **완료 기준**
  - [ ] 예제 단위 테스트 1개 + 예제 E2E 1개(로그인 페이지 렌더)가 로컬·CI 통과

## ⬜ T0.3 인증 API

- **내용**: 모의 OTP — 실제 SMS 없이 코드가 응답·발송로그에 노출. 세션은 httpOnly 쿠키

| 엔드포인트 | 동작 |
|---|---|
| `POST /api/auth/otp/request` | OtpCode 생성(5분 만료), 응답에 코드 포함(데모 노출) + MessageLog(OTP) 기록 |
| `POST /api/auth/otp/verify` | 검증 → 기존 User면 Session 발급, 신규면 가입 티켓 반환 |
| `POST /api/auth/demo-login` | 시드 계정 4종 중 하나로 즉시 세션 발급 |
| `POST /api/auth/logout` | 세션 삭제 |
| `GET /api/me` | 내 User + 프로필 목록 + 활성 프로필 |

- **완료 기준**
  - [ ] 데모 계정 4종 원클릭 로그인 성공
  - [ ] 신규 번호 OTP → 가입 티켓 → 온보딩 진입
  - [ ] 만료·오입력·재사용 코드 거부
- **테스트** — 최소: verify 4케이스(정상/만료/오코드/재사용) · demo-login 세션 발급 · me 401/200 / 통합: demo-login → `/api/me` 프로필 응답(E2E 픽스처 헬퍼로 재사용)

## ⬜ T0.4 로그인·온보딩 화면

| 라우트 | 화면·기능 |
|---|---|
| `/login` | 전화번호 → OTP 입력(데모 코드 화면 노출), 하단 역할별 원클릭 데모 로그인 버튼 4개 |
| `/onboarding` | 이름 + 프로필 유형 선택. 중개인: 사무소명·주소(좌표)·활동반경 / 마스터: 업체명·업종(복수)·활동반경. 세입자 선택 시 대기 계약 있으면 수락 화면(T1.3)으로 |

| 엔드포인트 | 동작 |
|---|---|
| `POST /api/profiles` | 프로필 추가(유형별 Detail 포함), `PATCH /api/profiles/[id]` 수정 |

- **완료 기준**
  - [ ] 신규 가입 전 플로우 화면 완주(전화번호→OTP→이름·유형→홈)
  - [ ] 세입자 유형 선택 시 대기 계약 리다이렉트
- **테스트** — 최소: 프로필 생성 zod 검증(유형별 Detail 필수값), 중복 유형 409 / 통합: **E2E①** 원클릭 임대인 로그인→홈 **E2E②** 신규 OTP 가입→온보딩→세입자 프로필→수락 화면 노출

## ⬜ T0.5 웹 셸 + 프로필 전환

- **내용**: 480px 모바일 셸(D5) + 활성 프로필별 하단 탭바, 어드민 데스크톱 사이드바 셸. 활성 프로필은 Jotai atom + 쿠키

| 프로필 | 탭바 구성 |
|---|---|
| 임대인 | 홈 · 자산 · 중개요청 · 커뮤니티 · 마이 |
| 세입자 | 홈 · 매물 · 환급 · 커뮤니티 · 마이 |
| 중개인 | 홈(수신함) · 매물 · 커뮤니티 · 마이 |
| 마스터 | 홈(의뢰피드) · 견적 · 커뮤니티 · 마이 |

| 라우트/API | 동작 |
|---|---|
| `/me` | 마이페이지 — 프로필 전환 시트(+새 유형 추가), 내 정보, 로그아웃 |
| `POST /api/profiles/active` | 활성 프로필 전환(쿠키 갱신) |

- **완료 기준**
  - [ ] 프로필 전환 시 탭바·홈이 새로고침 없이 즉시 변경
  - [ ] 비로그인 보호 라우트 → `/login` 리다이렉트
- **테스트** — 최소: active 전환 시 타인 프로필 id 403 / 통합: E2E 프로필 추가→전환→탭바 변경

## ⬜ T0.6 packages/ui 디자인 토큰

- **내용**: 자리톡 옐로 브랜드 톤(C1) PandaCSS preset — 컬러·타이포·spacing 토큰 + 기본 컴포넌트(Button·Input·Sheet·Badge·Card)
- **완료 기준**
  - [ ] web·admin이 동일 preset 소비, 로그인·셸 화면에 하드코딩 색상 0

## ⬜ T0.7 트래킹 코어

- **내용**: 1st-party 쿠키 anonId(미들웨어), 라우트 전환 `page_view` 자동 수집, `useTrack()` 훅(`packages/ui`), sendBeacon 전송. 이벤트 네이밍 `<domain>_<object>_<action>`

| 엔드포인트 | 동작 |
|---|---|
| `POST /api/track` | 이벤트 수집(배열 허용, 로그인 시 userId 연결) |

- **완료 기준**
  - [ ] 페이지 이동 시 TrackingEvent에 page_view 적재, 로그인 시 userId 연결
- **테스트** — 최소: 배열 수집·스키마 불일치 400·anonId 없는 요청 처리 / 통합: E2E 로그인 여정 후 `page_view`+`signup_*` 이벤트 존재

## Phase 완료 조건

- [ ] 전 task ✅
- [ ] E2E: 원클릭 로그인 4종 + 신규 가입 여정 green
- [ ] 라이브 URL에서 데모 로그인 가능
