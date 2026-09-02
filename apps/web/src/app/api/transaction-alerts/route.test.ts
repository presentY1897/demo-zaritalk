/**
 * `GET·POST·DELETE /api/transaction-alerts` API 테스트 (T4.4).
 *
 * T4.4 최소 테스트 축 **구독 유니크** 가 여기 있다 — 스키마의 `@@unique` 가 nullable 컬럼
 * 때문에 NULL 조합을 막지 못하므로(Postgres `NULLS DISTINCT`), 애플리케이션이 막는지 확인한다.
 */
import { prisma, ProfileType, RealDealType } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

import { MAX_ALERTS_PER_ACCOUNT } from "@/features/deals/subscriptions";
import type { TransactionAlertListResult, TransactionAlertResult } from "@/features/deals/types";
import { loginAs } from "@/features/landlord/testing";
import { resetTestCookies, setTestCookie } from "@/lib/auth/testing";
import { ACTIVE_PROFILE_COOKIE, SESSION_COOKIE } from "@/lib/auth/session";
import { DELETE, GET, POST } from "./route";

const url = "http://localhost:3000/api/transaction-alerts";

function postRequest(body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteRequest(query: string): Request {
  return new Request(`${url}${query}`, { method: "DELETE" });
}

async function createAccount(
  phone: string,
  name: string,
  types: ProfileType[] = [ProfileType.TENANT],
) {
  return prisma.user.create({
    data: { phone, name, profiles: { create: types.map((type) => ({ type })) } },
    include: { profiles: { orderBy: { createdAt: "asc" } } },
  });
}

async function login(user: { id: string }) {
  setTestCookie(SESSION_COOKIE, await loginAs(user.id));
}

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
});

describe("로그인이 필요하다", () => {
  test("비로그인 GET·POST·DELETE 는 401", async () => {
    expect((await GET()).status).toBe(401);
    expect((await POST(postRequest({ lawdCd: "11200" }))).status).toBe(401);
    expect((await DELETE(deleteRequest("?id=x"))).status).toBe(401);
  });

  test("로그인했지만 프로필이 없으면 403", async () => {
    const user = await prisma.user.create({ data: { phone: "01033333333", name: "온보딩전" } });
    await login(user);
    const response = await POST(postRequest({ lawdCd: "11200" }));
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("FORBIDDEN");
  });
});

describe("생성", () => {
  test("지역만 구독하면 나머지는 «전부» 다", async () => {
    const user = await createAccount("01011111111", "김임대");
    await login(user);

    const response = await POST(postRequest({ lawdCd: "11200" }));
    expect(response.status).toBe(201);
    const body = (await response.json()) as TransactionAlertResult;
    expect(body.duplicated).toBe(false);
    expect(body.alert).toMatchObject({
      lawdCd: "11200",
      regionLabel: "서울 성동구",
      aptName: null,
      dealType: null,
      summary: "서울 성동구 · 단지 전체 · 모든 유형",
    });
  });

  test("단지·유형까지 고르면 요약에 그대로 실린다", async () => {
    const user = await createAccount("01011111111", "김임대");
    await login(user);

    const response = await POST(
      postRequest({ lawdCd: "11200", aptName: "신금호파크자이", dealType: "JEONSE" }),
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as TransactionAlertResult;
    expect(body.alert.summary).toBe("서울 성동구 · 신금호파크자이 · 전세");
  });

  test("**활성 프로필**이 주인이 된다", async () => {
    const user = await createAccount("01011111111", "김임대", [
      ProfileType.TENANT,
      ProfileType.LANDLORD,
    ]);
    await login(user);
    const landlord = user.profiles.find((profile) => profile.type === ProfileType.LANDLORD)!;
    setTestCookie(ACTIVE_PROFILE_COOKIE, landlord.id);

    await POST(postRequest({ lawdCd: "11200" }));
    const row = await prisma.transactionAlert.findFirst();
    expect(row!.profileId).toBe(landlord.id);
  });
});

describe("축: 구독 유니크 — 같은 조합은 하나뿐", () => {
  test("**NULL 이 섞인 조합도 두 번 만들어지지 않는다** (DB 유니크가 못 막는 자리)", async () => {
    const user = await createAccount("01011111111", "김임대");
    await login(user);

    const first = await POST(postRequest({ lawdCd: "11200" }));
    expect(first.status).toBe(201);

    const second = await POST(postRequest({ lawdCd: "11200" }));
    expect(second.status).toBe(200);
    const body = (await second.json()) as TransactionAlertResult;
    expect(body.duplicated).toBe(true);
    expect(body.alert.id).toBe(((await first.json()) as TransactionAlertResult).alert.id);

    expect(await prisma.transactionAlert.count()).toBe(1);
  });

  test("단지·유형이 다 채워진 조합도 하나뿐", async () => {
    const user = await createAccount("01011111111", "김임대");
    await login(user);

    const payload = { lawdCd: "11200", aptName: "센트라스", dealType: "SALE" };
    expect((await POST(postRequest(payload))).status).toBe(201);
    expect((await POST(postRequest(payload))).status).toBe(200);
    expect(await prisma.transactionAlert.count()).toBe(1);
  });

  test("한 칸이라도 다르면 다른 구독이다", async () => {
    const user = await createAccount("01011111111", "김임대");
    await login(user);

    await POST(postRequest({ lawdCd: "11200" }));
    await POST(postRequest({ lawdCd: "11200", dealType: "SALE" }));
    await POST(postRequest({ lawdCd: "11200", aptName: "센트라스" }));
    await POST(postRequest({ lawdCd: "11680" }));
    expect(await prisma.transactionAlert.count()).toBe(4);
  });

  test("동시에 같은 요청이 들어와도 하나만 만들어진다", async () => {
    const user = await createAccount("01011111111", "김임대");
    await login(user);

    const results = await Promise.all([
      POST(postRequest({ lawdCd: "11200" })),
      POST(postRequest({ lawdCd: "11200" })),
      POST(postRequest({ lawdCd: "11200" })),
    ]);
    expect(results.every((response) => response.ok)).toBe(true);
    expect(await prisma.transactionAlert.count()).toBe(1);
  });

  test("사람이 다르면 각자 구독한다", async () => {
    const first = await createAccount("01011111111", "김임대");
    await login(first);
    await POST(postRequest({ lawdCd: "11200" }));

    resetTestCookies();
    const second = await createAccount("01022222222", "박세입");
    await login(second);
    await POST(postRequest({ lawdCd: "11200" }));

    expect(await prisma.transactionAlert.count()).toBe(2);
  });

  test(`계정당 ${MAX_ALERTS_PER_ACCOUNT}개를 넘으면 409`, async () => {
    const user = await createAccount("01011111111", "김임대");
    await login(user);
    for (let index = 0; index < MAX_ALERTS_PER_ACCOUNT; index += 1) {
      await POST(postRequest({ lawdCd: "11200", aptName: `단지${index}` }));
    }
    const response = await POST(postRequest({ lawdCd: "11200", aptName: "하나더" }));
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("CONFLICT");
  });
});

describe("목록·삭제 — 소유는 계정 단위", () => {
  test("최근 것이 위, 내 것만 보인다", async () => {
    const mine = await createAccount("01011111111", "김임대");
    const other = await createAccount("01022222222", "박세입");
    await prisma.transactionAlert.create({
      data: { profileId: other.profiles[0]!.id, lawdCd: "11680" },
    });

    await login(mine);
    await POST(postRequest({ lawdCd: "11200" }));
    await POST(postRequest({ lawdCd: "11680", dealType: "SALE" }));

    const body = (await (await GET()).json()) as TransactionAlertListResult;
    expect(body.alerts).toHaveLength(2);
    expect(body.alerts[0]!.lawdCd).toBe("11680");
  });

  test("**다른 프로필로 걸어 둔 구독도 지울 수 있다**(쓰기는 활성 프로필, 소유는 계정)", async () => {
    const user = await createAccount("01011111111", "김임대", [
      ProfileType.TENANT,
      ProfileType.LANDLORD,
    ]);
    const tenant = user.profiles.find((profile) => profile.type === ProfileType.TENANT)!;
    const landlord = user.profiles.find((profile) => profile.type === ProfileType.LANDLORD)!;
    const alert = await prisma.transactionAlert.create({
      data: { profileId: tenant.id, lawdCd: "11200", dealType: RealDealType.JEONSE },
    });

    await login(user);
    setTestCookie(ACTIVE_PROFILE_COOKIE, landlord.id);

    const response = await DELETE(deleteRequest(`?id=${alert.id}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: true, alertId: alert.id });
    expect(await prisma.transactionAlert.count()).toBe(0);
  });

  test("**남의 구독 삭제는 403**", async () => {
    const other = await createAccount("01022222222", "박세입");
    const alert = await prisma.transactionAlert.create({
      data: { profileId: other.profiles[0]!.id, lawdCd: "11200" },
    });

    const mine = await createAccount("01011111111", "김임대");
    await login(mine);

    const response = await DELETE(deleteRequest(`?id=${alert.id}`));
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("FORBIDDEN");
    expect(await prisma.transactionAlert.count()).toBe(1);
  });

  test("없는 구독은 404", async () => {
    const user = await createAccount("01011111111", "김임대");
    await login(user);
    expect((await DELETE(deleteRequest("?id=cmf0nope"))).status).toBe(404);
  });

  test("id 가 없으면 400", async () => {
    const user = await createAccount("01011111111", "김임대");
    await login(user);
    expect((await DELETE(deleteRequest(""))).status).toBe(400);
  });
});

describe("검증", () => {
  test("모르는 지역·유형·긴 단지명은 400", async () => {
    const user = await createAccount("01011111111", "김임대");
    await login(user);
    expect((await POST(postRequest({ lawdCd: "99999" }))).status).toBe(400);
    expect((await POST(postRequest({ lawdCd: "11200", dealType: "RENT" }))).status).toBe(400);
    expect(
      (await POST(postRequest({ lawdCd: "11200", aptName: "가".repeat(61) }))).status,
    ).toBe(400);
    expect((await POST(postRequest({ lawdCd: "11200", aptName: "   " }))).status).toBe(400);
  });
});
