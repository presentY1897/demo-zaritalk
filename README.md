# zari-demo

자리톡 서비스를 참고해 만든 **비공식 데모 프로젝트**입니다. 임대인·세입자·중개인·마스터(협력업체) 4개 역할과 백오피스를 갖춘 임대관리 서비스를 재구성합니다.

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
- **통근시간**: 카카오모빌리티(차량) + ODsay(대중교통), `(호실, 근무지)` 단위 캐시
- **자리페이**: 토스페이먼츠 테스트모드, 결제 성공 시 수납 원장 자동 반영
- **그로스**: 자체 이벤트 트래킹(`TrackingEvent`) + A/B 배정(`AbAssignment`)
