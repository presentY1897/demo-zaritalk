/**
 * 원장 엔진 (T1.4) 공개 API.
 *
 * 여기서 나가는 것은 **전부 순수 함수**다 — prisma 를 끌어오지 않으므로
 * 서버·클라이언트 어디서든 import 해도 되고 단위 테스트가 DB 없이 돈다.
 * DB를 다루는 크론 실행부는 `@/lib/rent/cron-runner` 에 따로 있다(서버 전용).
 *
 * 소비자 안내는 `docs/tasks/t1.4-rent-engine.md` 참고.
 */
export * from "./types";
export * from "./date";
export * from "./ledger";
