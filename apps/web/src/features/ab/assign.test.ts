/**
 * 배정 기록 (T6.1) — `AbAssignment` 한 줄이 어떻게 남고 유지되는가.
 * 핵심 3개 중 ③userId 연결 유지가 여기서 지켜진다.
 */
import { prisma } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test } from "vitest";
import { NOTICE_CTA_EXPERIMENT } from "@/features/notice/cta";
import { assignVariant } from "./assign";
import { EXPERIMENTS } from "./experiments";
import { variantFor } from "./hash";

const ANON = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const NOTICE_CTA = EXPERIMENTS[NOTICE_CTA_EXPERIMENT];
if (!NOTICE_CTA) throw new Error("notice_cta 실험이 등록돼 있어야 한다");

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
});

async function createUser(phone = "01011112222") {
  return prisma.user.create({ data: { phone, name: "홍미가" } });
}

test("처음 부르면 배정을 만들고, 값은 해시가 정한 그대로다", async () => {
  const assignment = await assignVariant(ANON, NOTICE_CTA_EXPERIMENT);

  expect(assignment?.created).toBe(true);
  expect(assignment?.persisted).toBe(true);
  expect(assignment?.variant).toBe(variantFor(ANON, NOTICE_CTA_EXPERIMENT, NOTICE_CTA.variants));

  const rows = await prisma.abAssignment.findMany();
  expect(rows).toHaveLength(1);
  expect(rows[0]?.experimentKey).toBe(NOTICE_CTA_EXPERIMENT);
});

test("① 같은 anonId 를 다시 불러도 같은 변형 — 줄은 하나만 생긴다", async () => {
  const first = await assignVariant(ANON, NOTICE_CTA_EXPERIMENT);
  const second = await assignVariant(ANON, NOTICE_CTA_EXPERIMENT);
  const third = await assignVariant(ANON, NOTICE_CTA_EXPERIMENT);

  expect(second?.variant).toBe(first?.variant);
  expect(third?.variant).toBe(first?.variant);
  expect(second?.created).toBe(false);
  expect(await prisma.abAssignment.count()).toBe(1);
});

test("동시에 여러 번 불러도 줄은 하나 (유니크 제약 경합)", async () => {
  const results = await Promise.all(
    Array.from({ length: 8 }, () => assignVariant(ANON, NOTICE_CTA_EXPERIMENT)),
  );

  expect(new Set(results.map((item) => item?.variant)).size).toBe(1);
  expect(await prisma.abAssignment.count()).toBe(1);
});

test("③ 로그인하면 userId 가 붙고, 이후 호출에서도 유지된다", async () => {
  const user = await createUser();

  await assignVariant(ANON, NOTICE_CTA_EXPERIMENT); // 비로그인 노출
  expect((await prisma.abAssignment.findFirst())?.userId).toBeNull();

  const linked = await assignVariant(ANON, NOTICE_CTA_EXPERIMENT, user.id);
  expect(linked?.userId).toBe(user.id);

  // 다시 비로그인으로 불러도 지워지지 않는다
  const again = await assignVariant(ANON, NOTICE_CTA_EXPERIMENT);
  expect(again?.userId).toBe(user.id);
  expect(again?.variant).toBe(linked?.variant);
});

test("③ 이미 붙은 계정은 다른 계정으로 덮어쓰지 않는다", async () => {
  const first = await createUser("01011112222");
  const second = await createUser("01033334444");

  await assignVariant(ANON, NOTICE_CTA_EXPERIMENT, first.id);
  const result = await assignVariant(ANON, NOTICE_CTA_EXPERIMENT, second.id);

  expect(result?.userId).toBe(first.id);
});

test("등록되지 않은 실험 키는 null — 줄도 남지 않는다", async () => {
  expect(await assignVariant(ANON, "no_such_experiment")).toBeNull();
  expect(await assignVariant(ANON, "대문자·한글")).toBeNull();
  expect(await prisma.abAssignment.count()).toBe(0);
});

test("실험 정의에 없는 변형이 남아 있으면 다시 배정한다", async () => {
  await prisma.abAssignment.create({
    data: { anonId: ANON, experimentKey: NOTICE_CTA_EXPERIMENT, variant: "Z" },
  });

  const repaired = await assignVariant(ANON, NOTICE_CTA_EXPERIMENT);
  expect(repaired?.variant).toBe(variantFor(ANON, NOTICE_CTA_EXPERIMENT, NOTICE_CTA.variants));
  expect(await prisma.abAssignment.count()).toBe(1);
});

test("서로 다른 anonId 는 각자 배정을 갖는다", async () => {
  const other = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  await assignVariant(ANON, NOTICE_CTA_EXPERIMENT);
  await assignVariant(other, NOTICE_CTA_EXPERIMENT);

  const rows = await prisma.abAssignment.findMany({ orderBy: { anonId: "asc" } });
  expect(rows).toHaveLength(2);
  expect(rows[0]?.variant).toBe(variantFor(ANON, NOTICE_CTA_EXPERIMENT, NOTICE_CTA.variants));
  expect(rows[1]?.variant).toBe(variantFor(other, NOTICE_CTA_EXPERIMENT, NOTICE_CTA.variants));
});
