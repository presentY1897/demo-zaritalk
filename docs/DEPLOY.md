# 배포 — Vercel + Neon 연결 절차 (T0.1)

> [C2 결정](./DECISIONS.md#-c2-배포-파이프라인-phase-0-선행): Vercel + Neon Postgres + GitHub Actions CI.
> GitHub 레포·CI는 연결 완료. 남은 건 **Neon DB**와 **Vercel 프로젝트 2개(web·admin)** 다.
>
> 계정 가입·연결 클릭은 사용자 액션, 그 외 설정값·마이그레이션·시드는 Claude가 처리한다.

## 구성

| | web | admin |
|---|---|---|
| Vercel Root Directory | `apps/web` | `apps/admin` |
| 설정 파일 | `apps/web/vercel.json` | `apps/admin/vercel.json` |
| 빌드 | `turbo run build --filter=@zari/web...` (레포 루트에서) | 〃 `@zari/admin...` |
| 용도 | 모바일 웹(480px 셸) | 데스크톱 백오피스 |

`vercel.json` 이 install·build 를 레포 루트에서 돌리게 잡아 뒀다. 그래야 turbo 가 의존 패키지까지
빌드해 **`prisma generate`(@zari/db) 와 `panda codegen`(@zari/ui)** 이 함께 돌아간다 —
둘 다 gitignore 된 코드젠 산출물이라 이 단계가 빠지면 빌드가 깨진다(CI에서 같은 이유로 한 번 깨졌다).

## 1단계 — Neon Postgres (사용자) ✅ 완료

1. https://neon.tech 가입 → **New Project** (리전은 아무거나, 가까운 곳 권장)
2. 생성 후 **Connection string** 화면에서 **두 가지**를 복사한다:
   - **Pooled** — 호스트에 `-pooler` 가 붙은 것 → 앱 런타임용
   - **Direct** — `-pooler` 없는 것 → 마이그레이션용 (PgBouncer 위에서는 마이그레이션이 불안정하다)
3. 레포 루트에 **`.env.neon`** 파일을 만들어 아래처럼 붙여넣는다. `.gitignore` 가 `.env.*` 를 막고 있어 커밋되지 않는다.

```sh
# .env.neon — 커밋 금지 (gitignore 됨)
NEON_POOLED_URL="postgresql://...-pooler.../neondb?sslmode=verify-full&channel_binding=require"
NEON_DIRECT_URL="postgresql://.../neondb?sslmode=verify-full&channel_binding=require"
```

> Neon이 주는 문자열은 `sslmode=require` 인데, node-postgres 8.23+ 는 이걸 쓰면
> "앞으로 동작이 바뀐다"는 deprecation 경고를 낸다(Vercel 로그에도 뜬다).
> Neon은 공개 CA 인증서라 **`sslmode=verify-full`** 로 바꿔도 그대로 붙고 서버 인증서 검증까지 한다.

## 2단계 — 스키마·시드 적용 (Claude) ✅ 완료

`.env.neon` 이 생기면 아래를 실행한다.

```sh
set -a; . ./.env.neon; set +a
DATABASE_URL="$NEON_DIRECT_URL" pnpm db:deploy   # prisma migrate deploy
DATABASE_URL="$NEON_DIRECT_URL" pnpm db:seed     # 데모 시드
```

> `db:seed` 는 **전 테이블을 지우고 다시 만든다.** 데모 DB 전용이라 그렇게 설계돼 있다.
> 스키마가 바뀔 때마다(Phase 1~6) `db:deploy` 를 다시 돌린다.
>
> 시드의 일괄 삭제는 29개 `deleteMany` 를 한 트랜잭션에 묶는데, 원격 DB는 왕복 지연이 커서
> 기본 5초 제한(P2028)에 걸린다. `{ timeout: 120_000 }` 으로 올려 뒀다.

## 3단계 — Vercel 프로젝트 2개 (사용자 + Claude) ✅ 완료

각 앱마다 **Add New → Project → 이 레포 선택** 을 반복한다. 즉, 같은 레포로 프로젝트를 두 개 만든다.

| 항목 | web | admin |
|---|---|---|
| Project Name | `zari-demo-web` (예시) | `zari-demo-admin` |
| Root Directory | **`apps/web`** | **`apps/admin`** |
| Framework Preset | Next.js (자동 인식) | 〃 |
| Build/Install Command | **건드리지 말 것** — `vercel.json` 이 지정한다 | 〃 |

**환경변수** (두 프로젝트 모두, Production·Preview·Development 전부 체크):

| 이름 | 값 |
|---|---|
| `DATABASE_URL` | `.env.neon` 의 **`NEON_POOLED_URL`** (pooler 붙은 쪽, `sslmode=verify-full`) |

> **Value 칸에는 순수 연결 문자열만 넣는다.** `DATABASE_URL="postgresql://…"` 처럼 키 이름이나
> 따옴표가 같이 들어가면 pg 가 파싱에 실패하고 호스트가 `base` 로 잡혀 전부 500 이 난다.
> `DATABASE_URL=…` 형식은 입력칸 위의 **`.env` 일괄 붙여넣기 영역** 전용이다.
>
> CLI 로 넣는 게 확실하다: `printf '%s' "$NEON_POOLED_URL" | vercel env add DATABASE_URL production --cwd apps/web`

> 외부 API 키(카카오·ODsay·토스·공공데이터)는 해당 Phase 착수 시점에 추가한다.
> 목록은 [`.env.example`](../.env.example) 참조.

## 4단계 — 확인

`main` 에 push → Vercel 자동 배포 후:

| 확인 | 기대값 |
|---|---|
| `GET /api/health` | `{"ok":true,"db":"up","users":5}` |
| `GET /` | 200 |
| `GET /api/me` (비로그인) | 401 |
| `POST /api/auth/demo-login` `{"role":"landlord"}` | 200 + 세션 쿠키 |
| admin `/` | 사이드바 셸 |

### `/api/health` 로 원인 구분하기

DB가 안 붙으면 다른 라우트는 **빈 500** 만 내서 밖에서 원인을 알 수 없다. health 는 구분해 준다:

| 응답 | 뜻 | 할 일 |
|---|---|---|
| `{"db":"unconfigured","databaseUrlConfigured":false}` | 런타임에 `DATABASE_URL` 이 없다 | Vercel 환경변수 확인 → **저장 후 Redeploy**(기존 배포엔 반영 안 된다) |
| `target: "(파싱 불가 …)"` | 값에 따옴표가 섞였다 | Value 에서 앞뒤 `"` 제거 |
| `{"db":"down", "error": …}` | 붙었는데 실패 | error 메시지로 판단(호스트 오타·SSL·스키마 미적용) |
| `{"db":"up"}` | 정상 | — |

`target` 은 호스트와 DB 이름만 보여 준다 — 사용자·비밀번호는 응답에 넣지 않는다.

## 알아둘 것

- **Preview 배포도 같은 Neon DB를 본다.** 브랜치별 DB 분리는 데모 범위 밖이다 —
  PR 미리보기에서 데이터를 바꾸면 프로덕션 데모 데이터가 같이 바뀐다.
- **마이그레이션은 빌드에 넣지 않았다.** 빌드 중 프로덕션 스키마가 말없이 바뀌는 게 더 위험하고,
  turbo 캐시가 걸리면 건너뛸 수도 있어서다. 스키마 변경 시 2단계를 다시 돌린다.
- Vercel 무료 플랜은 서버리스 함수라 Neon **pooled** 엔드포인트를 써야 커넥션이 마르지 않는다.
