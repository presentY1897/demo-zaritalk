# tasks/ — 작성·운영 규칙

**task 1개 = 파일 1개.** 파일명은 `t<phase>.<번호>-<이름>.md` — 정렬이 곧 실행 순서다.
Phase 구성·순서·완료 조건은 [../PHASES.md](../PHASES.md), 결정 배경은 [../DECISIONS.md](../DECISIONS.md) 참조.

## task 파일 구조

- 상단 상태줄: `> Phase N · 상태: ⬜/🔨/✅` — 작업하면서 갱신
- 본문: **구현 내용(페이지·API 표 포함) → 완료 기준(체크박스) → 테스트(최소/통합)** — 이 파일만 보고 작업·검수 가능해야 한다

## 테스트 규칙 ([D8](../DECISIONS.md#-d8-테스트-스택) 결정 대기)

- **최소 테스트 = Vitest 단위·API.** 순수 로직은 함수 단위, Route Handler는 Request 객체로 직접 호출. DB 필요 시 테스트 전용 DB(`zari_test`)에서 truncate 격리.
- **통합 테스트 = Playwright E2E.** 핵심 사용자 여정만, 시드 데이터 기반.
- **외부 API**(토스·카카오·ODsay·국토부)는 단위에서 mock. E2E는 토스 테스트모드만 실호출, 키 없으면 skip 태그.
- 커버리지 %는 목표가 아니다. **돈·상태 전이 로직은 반드시 단위 테스트, 핵심 여정은 반드시 E2E.**

## 공통 완료 기준 (모든 task에 적용)

1. `pnpm build`·`pnpm typecheck`·`pnpm test` 통과 (CI green)
2. 시드 데이터만으로 해당 화면·API가 동작
3. 웹은 480px 모바일 셸 기준, 어드민은 데스크톱 기준 확인
4. 해당되는 경우 트래킹 이벤트(`<domain>_<object>_<action>`) 심기
5. task 상태·완료 기준 체크박스 + [PHASES.md](../PHASES.md) 상태 갱신
