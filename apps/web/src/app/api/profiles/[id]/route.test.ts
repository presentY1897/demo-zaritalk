import { prisma, ProfileType } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import { createSession } from "@/lib/auth/session";
import { resetTestCookies } from "@/lib/auth/testing";
import { PATCH } from "./route";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
});

function patch(id: string, body: unknown): Promise<Response> {
  return PATCH(
    new Request(`http://localhost/api/profiles/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

const realtorDetail = {
  officeName: "왕십리부동산",
  address: "서울 성동구 왕십리로 300",
  lat: 37.56133,
  lng: 127.03782,
  radiusKm: 3,
};

async function createRealtor(phone: string, name: string) {
  const user = await prisma.user.create({
    data: {
      phone,
      name,
      profiles: {
        create: { type: ProfileType.REALTOR, realtorDetail: { create: realtorDetail } },
      },
    },
    include: { profiles: true },
  });
  return { user, profile: user.profiles[0]! };
}

test("내 중개인 프로필의 사무소 정보를 수정한다", async () => {
  const { user, profile } = await createRealtor("01033333333", "이중개");
  await createSession(user.id);

  const res = await patch(profile.id, {
    name: "이중개2",
    realtor: {
      officeName: "성수공인중개",
      address: "서울 성동구 아차산로 100",
      lat: 37.54453,
      lng: 127.05599,
      radiusKm: 5,
      intro: "성수동 원룸 전문",
    },
  });

  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.profile.realtorDetail).toMatchObject({
    officeName: "성수공인중개",
    radiusKm: 5,
    intro: "성수동 원룸 전문",
  });
  expect(body.me.user.name).toBe("이중개2");

  const detail = await prisma.realtorDetail.findUniqueOrThrow({
    where: { profileId: profile.id },
  });
  expect(detail.lat).toBeCloseTo(37.54453);
});

test("남의 프로필을 수정하려 하면 403", async () => {
  const owner = await createRealtor("01033333333", "이중개");
  const other = await prisma.user.create({
    data: { phone: "01044444444", name: "최마스", profiles: { create: { type: ProfileType.MASTER } } },
  });
  await createSession(other.id);

  const res = await patch(owner.profile.id, { realtor: realtorDetail });
  expect(res.status).toBe(403);
  expect((await res.json()).error.code).toBe("FORBIDDEN");

  // 원본은 그대로다
  const detail = await prisma.realtorDetail.findUniqueOrThrow({
    where: { profileId: owner.profile.id },
  });
  expect(detail.officeName).toBe("왕십리부동산");
});

test("비로그인이면 401", async () => {
  const { profile } = await createRealtor("01033333333", "이중개");

  const res = await patch(profile.id, { realtor: realtorDetail });
  expect(res.status).toBe(401);
  expect((await res.json()).error.code).toBe("UNAUTHORIZED");
});

test("없는 프로필이면 404", async () => {
  const { user } = await createRealtor("01033333333", "이중개");
  await createSession(user.id);

  const res = await patch("cmf000000000000000000000", { realtor: realtorDetail });
  expect(res.status).toBe(404);
  expect((await res.json()).error.code).toBe("NOT_FOUND");
});

test("중개인 프로필인데 realtor Detail 이 빠지면 400", async () => {
  const { user, profile } = await createRealtor("01033333333", "이중개");
  await createSession(user.id);

  const res = await patch(profile.id, { name: "이중개2" });
  expect(res.status).toBe(400);
  expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
});

test("임대인 프로필은 Detail 없이 이름만 수정한다", async () => {
  const user = await prisma.user.create({
    data: {
      phone: "01011111111",
      name: "김임대",
      profiles: { create: { type: ProfileType.LANDLORD } },
    },
    include: { profiles: true },
  });
  await createSession(user.id);

  const res = await patch(user.profiles[0]!.id, { name: "김임대장" });
  expect(res.status).toBe(200);
  expect((await res.json()).me.user.name).toBe("김임대장");
});
