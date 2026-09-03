# zari-demo

자리톡 서비스를 참고해 만든 **비공식 데모 프로젝트**입니다. 임대인·세입자·중개인·마스터(협력업체) 4개 역할과 백오피스를 갖춘 임대관리 서비스를 재구성합니다.

| | |
|---|---|
| 라이브 | **https://demo-zaritalk.vercel.app** (백오피스: `demo-zaritalk-admin.vercel.app`) |
| 규모 | task 42개 · 단위·API 테스트 1500여 개 · E2E 43개 |
| 외부 연동 | 카카오맵·로컬·모빌리티 · 토스페이먼츠(테스트모드) · 국토교통부 실거래가 · Vercel Blob |

문서: [진행 현황·Phase](docs/PHASES.md) · [결정 로그](docs/DECISIONS.md) · [task별 상세](docs/tasks/) · [배포](docs/DEPLOY.md)

## 구조

```
apps/
  web/        # 사용자 모바일 웹 (앱 웹뷰 가정, port 3000)
  admin/      # 운영자 백오피스 (port 3001)
packages/
  db/         # Prisma 스키마 + 클라이언트 (@zari/db)
  ui/         # 공유 디자인 토큰/컴포넌트 (@zari/ui)
  config/     # 공유 tsconfig (@zari/config)
```

스택: Next.js(App Router) · TypeScript · Tanstack Query · Jotai · PandaCSS · Prisma · PostgreSQL · TurboRepo · pnpm

## 시작하기

```bash
# 1. 의존성 설치
pnpm install

# 2. 로컬 DB 실행
docker compose up -d

# 3. 환경변수: .env.example 참고
cp .env.example packages/db/.env        # DATABASE_URL (Prisma CLI)
cp .env.example apps/web/.env.local     # 앱 런타임 (API 키 포함)
cp .env.example apps/admin/.env.local

# 4. DB 마이그레이션 & 클라이언트 생성
pnpm db:migrate

# 5. 개발 서버 (web: 3000, admin: 3001)
pnpm dev
```

## 데모 시나리오

로그인 화면(`/login`)의 **원클릭 데모 로그인** 4개로 역할을 바로 바꿀 수 있습니다. 인증번호는
실제 SMS 없이 화면에 그대로 노출됩니다(데모용).

| 역할 | 번호 | 시연 |
|---|---|---|
| 임대인 김임대 | `01011111111` | 홈에서 **연체 1건 1,015,500원** → 계약 상세 수납 탭 → 가상 입금 → 완납 전환 → 고지서 발송 |
| 세입자 박세입 | `01022222222` | 홈에서 이번 달 납부 → **자리페이 카드결제**(토스 테스트) → 임대인 원장에 즉시 반영 |
| 중개인 이중개 | `01033333333` | 수신함에서 중개 요청 열람 → 수락 → 그 호실에 매물 등록 → `/search` 노출 |
| 마스터 최마스 | `01044444444` | **추천 탭**(유료 PRO)에 의뢰 노출 → 견적 제안 → 임대인이 수락 |
| 마스터 한마스 | `01066666666` | 무료 플랜 — 추천 탭이 비고 전체 피드로만 접근(유료 차이 시연) |
| 관리자 | `01000000000` | 백오피스 로그인(전화번호 + `ADMIN_PASSWORD`) |

**비로그인으로 볼 수 있는 화면** — 검색 유입 경로입니다.

- `/notice/demo-notice-hong` — 미가입 세입자에게 나간 **공개 고지서**. 하단 가입 CTA 가 A/B 대상(`?variant=B` 로 반대 안 미리보기)
- `/search` · `/listings/[id]` — 지도 탐색·매물 상세
- `/refund/calculator` — 월세 세액공제 계산기
- `/deals` — 국토부 실거래가

**3역할 관통 여정**: 세입자 민원 접수 → 임대인이 작업 의뢰로 전환 → 마스터 피드에 노출 →
견적 제안 → 임대인 수락 → 완료 → 민원 자동 해결. `e2e/quote.spec.ts` 가 이 여정을 통째로 검증합니다.

## 테스트

```bash
pnpm test:db     # 테스트 전용 DB(zari_test) 생성 + 마이그레이션 — 최초 1회
pnpm test        # 단위·API (Vitest)
pnpm test:e2e    # E2E (Playwright, web 을 3100 포트로 띄운다)
```

돈·상태 전이 로직(원장·결제 confirm·환급 계산·매칭·A/B 배정)은 반드시 단위 테스트,
Phase 별 핵심 여정은 반드시 E2E — 규칙은 [docs/tasks/README.md](docs/tasks/README.md) 참고.

## Git 워크플로우 (bare + worktree)

레포 루트에 `.bare/`(bare repo)와 워크트리(`main/`, `feature-*/`)가 나란히 있는 구조입니다.

```bash
git worktree add feature-<이름> -b feature-<이름>   # 새 작업
# 작업 완료 후: main으로 rebase → ff 머지 (merge.ff=only)
```

## 도메인 요약

- **1계정 다중 프로필**: `User` → `Profile(LANDLORD | TENANT | REALTOR | MASTER)`
- **건물 > 호실 > 계약**: `Building` → `Unit` → `Lease` (세입자는 전화번호 매칭 + 수락으로 연결)
- **수납 원장**: `RentCharge`(월별 청구, 미납 이월·연체료) + `RentPayment`(부분납부 지원)
- **고지서**: 알림톡 시뮬레이터(`MessageLog`) + 토큰 기반 공개 고지서 페이지
- **공실 중개**: 중개인 활동지역(좌표+반경) 기반 매칭 (`BrokerageRequest` → `BrokerageTarget`)
- **마스터 매칭**: 민원(`Complaint`) → 작업 의뢰(`WorkOrder`) → 업체 견적(`WorkOrderQuote`)
- **통근시간**: 카카오모빌리티(차량, 실연동) + 대중교통(**모의** — [D9](docs/DECISIONS.md)), `(호실, 근무지)` 단위 캐시
- **자리페이**: 토스페이먼츠 테스트모드, 결제 성공 시 수납 원장 자동 반영
- **그로스**: 자체 이벤트 트래킹(`TrackingEvent`) + A/B 배정(`AbAssignment`)

## 알려진 한계

데모 범위에서 의도적으로 남긴 것들입니다. 각 task 문서의 "스키마가 필요했지만 안 만든 것" 절에
근거가 있습니다.

- **대중교통 통근시간은 모의값**입니다. ODsay 키가 생기면 `features/commute/providers.ts` 한 줄로 교체됩니다([D9](docs/DECISIONS.md))
- **어드민 패스코드는 공유 비밀**이고 시도 횟수 제한이 없습니다. 관리자별 자격이 아닙니다(T6.3)
- **결제 부분 취소는 전액 회수로 처리**합니다 — `RentPayment` 에 취소 금액 컬럼이 없습니다(T2.1)
- **토스 키는 문서 공개 체험용**이라 사용자 대시보드에 잡히지 않습니다. 자기 계정 키로 바꾸려면 환경변수 두 개만 교체하면 됩니다
- **프리뷰 배포도 프로덕션과 같은 Neon DB** 를 봅니다 — 브랜치별 DB 분리는 범위 밖입니다([DEPLOY.md](docs/DEPLOY.md))
- **시드 금액 데이터는 2026-06~09 고정**이라, 그 창을 벗어나면 어드민 수납률·결제액 차트가 비어 보입니다(T6.2)
