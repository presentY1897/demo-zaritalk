# Task 문서 — 목차·공통 기준

> **task가 작업의 원본 문서다.** 각 task는 **구현 내용(페이지·API 포함) → 완료 기준 → 테스트**가 한 곳에 있어 그것만 보고 작업·검수할 수 있다.
> 왜 이렇게 만드는지(방식 선택의 배경)는 [DECISIONS.md](../DECISIONS.md), 데이터 모델은 [`schema.prisma`](../../packages/db/prisma/schema.prisma) 참조.
> 상태: ⬜ 미착수 · 🔨 진행중 · ✅ 완료 — 작업하면서 task 상태와 완료 기준 체크박스를 갱신한다.

| Phase | 문서 | 요약 |
|---|---|---|
| 0 | [phase-0.md](./phase-0.md) | 기반 공사 — 배포·테스트 인프라·인증·셸·트래킹 |
| 1 | [phase-1.md](./phase-1.md) | 임대인 코어 — 자산·계약·수납·고지 |
| 2 | [phase-2.md](./phase-2.md) | 세입자 — 자리페이·환급·민원 |
| 3 | [phase-3.md](./phase-3.md) | 매물·중개·통근 |
| 4 | [phase-4.md](./phase-4.md) | 커뮤니티·실거래가 |
| 5 | [phase-5.md](./phase-5.md) | 마스터 매칭 |
| 6 | [phase-6.md](./phase-6.md) | 그로스 마무리·대시보드 |

## 테스트 전략 ([D8](../DECISIONS.md#-d8-테스트-스택) 결정 대기)

- **최소 테스트 = Vitest 단위·API 테스트.** 순수 로직은 함수 단위, Route Handler는 Request 객체로 직접 호출. DB 필요 시 테스트 전용 DB(`zari_test`)에서 truncate 격리.
- **통합 테스트 = Playwright E2E.** Phase별 핵심 사용자 여정만, 시드 데이터 기반. CI에서 빌드 후 실행.
- **외부 API**(토스·카카오·ODsay·국토부)는 단위에서 mock. E2E는 토스 테스트모드만 실호출, 나머지는 키 없으면 skip 태그.
- 커버리지 %는 목표가 아니다. **돈·상태 전이 로직은 반드시 단위 테스트, Phase별 핵심 여정은 반드시 E2E.**

## 공통 완료 기준 (모든 task에 적용)

1. `pnpm build`·`pnpm typecheck`·`pnpm test` 통과 (CI green)
2. 시드 데이터만으로 해당 화면·API가 동작
3. 웹은 480px 모바일 셸 기준, 어드민은 데스크톱 기준 확인
4. 해당되는 경우 트래킹 이벤트(`<domain>_<object>_<action>`) 심기
5. task 상태·완료 기준 체크박스 갱신
