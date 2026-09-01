import { beforeEach, expect, test } from "vitest";
import { assertTestDatabase, prisma, resetDb } from "./testing";

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
});

test("resetDb 는 테스트 DB의 데이터를 모두 지운다", async () => {
  await prisma.user.create({ data: { phone: "01099998888", name: "테스트" } });
  expect(await prisma.user.count()).toBe(1);

  await resetDb();

  expect(await prisma.user.count()).toBe(0);
});

test("assertTestDatabase 는 데모 DB를 가리키면 막는다", () => {
  const original = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgresql://zari:zari@localhost:5432/zari";
  expect(() => assertTestDatabase()).toThrow(/test 가 들어간 DB/);
  process.env.DATABASE_URL = original;
});
