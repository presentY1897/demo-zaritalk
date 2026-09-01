import { LeaseStatus, prisma, ProfileType } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import { SIGNUP_TICKET_TTL_MS } from "@/lib/auth/otp";
import { SESSION_COOKIE, createSession } from "@/lib/auth/session";
import { getTestCookie, resetTestCookies } from "@/lib/auth/testing";
import { POST } from "./route";

// Route Handler 안의 cookies() 를 인메모리 쿠키 저장소로 바꿔 끼운다(T0.3 패턴)
vi.mock("next/headers", () => import("@/lib/auth/testing"));

const NEW_PHONE = "01088887777";

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
});

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/profiles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

/**
 * 검증을 마친 가입 티켓 = `OtpCode` 레코드 id (T0.3 설계).
 * verifiedAt 이 찍히고 expiresAt 이 티켓 만료(10분)로 바뀐 상태를 그대로 만든다.
 */
async function issueSignupTicket(phone = NEW_PHONE): Promise<string> {
  const otp = await prisma.otpCode.create({
    data: {
      phone,
      code: "123456",
      verifiedAt: new Date(),
      expiresAt: new Date(Date.now() + SIGNUP_TICKET_TTL_MS),
    },
  });
  return otp.id;
}

async function createLoggedInUser(type: ProfileType = ProfileType.LANDLORD) {
  const user = await prisma.user.create({
    data: { phone: "01011112222", name: "김임대", profiles: { create: { type } } },
    include: { profiles: true },
  });
  await createSession(user.id); // 쿠키 저장소에 세션 쿠키가 심긴다
  return user;
}

/** 내 번호로 등록된 수락 대기 계약 하나 */
async function createPendingLease(tenantPhone: string) {
  const landlord = await prisma.user.create({
    data: {
      phone: "01099998888",
      name: "박임대",
      profiles: { create: { type: ProfileType.LANDLORD } },
    },
    include: { profiles: true },
  });
  const building = await prisma.building.create({
    data: {
      ownerProfileId: landlord.profiles[0]!.id,
      name: "행당해피빌",
      address: "서울 성동구 행당로 79",
      lat: 37.56152,
      lng: 127.03648,
      units: { create: [{ label: "202호" }] },
    },
    include: { units: true },
  });
  return prisma.lease.create({
    data: {
      unitId: building.units[0]!.id,
      tenantName: "홍미가",
      tenantPhone,
      deposit: 10_000_000,
      monthlyRent: 550_000,
      paymentDay: 25,
      startDate: new Date("2026-07-25"),
      endDate: new Date("2027-07-24"),
      status: LeaseStatus.PENDING_TENANT,
    },
  });
}

const realtorDetail = {
  officeName: "왕십리부동산",
  address: "서울 성동구 왕십리로 300",
  lat: 37.56133,
  lng: 127.03782,
  radiusKm: 3,
};

const masterDetail = {
  companyName: "성수홈케어",
  categories: ["REPAIR", "CLEANING"],
  address: "서울 성동구 아차산로 100",
  lat: 37.54453,
  lng: 127.05599,
  radiusKm: 5,
};

// ---- ① 유형별 Detail zod 검증 ----

test("중개인인데 realtor Detail 이 없으면 400", async () => {
  const signupTicket = await issueSignupTicket();
  const res = await post({ type: "REALTOR", name: "이중개", signupTicket });

  expect(res.status).toBe(400);
  expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  expect(await prisma.user.count()).toBe(0); // 티켓도 살아 있다
  expect(await prisma.otpCode.count()).toBe(1);
});

test("중개인 Detail 의 필수값(사무소명·좌표)이 빠지면 400", async () => {
  const signupTicket = await issueSignupTicket();
  const res = await post({
    type: "REALTOR",
    name: "이중개",
    signupTicket,
    realtor: { address: "서울 성동구 왕십리로 300", radiusKm: 3 },
  });

  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.error.code).toBe("VALIDATION_ERROR");
  const paths = (body.error.details as { path: string[] }[]).map((issue) => issue.path.join("."));
  expect(paths).toEqual(expect.arrayContaining(["realtor.officeName", "realtor.lat", "realtor.lng"]));
});

test("마스터인데 업종을 하나도 안 고르면 400", async () => {
  const signupTicket = await issueSignupTicket();
  const res = await post({
    type: "MASTER",
    name: "최마스",
    signupTicket,
    master: { ...masterDetail, categories: [] },
  });

  expect(res.status).toBe(400);
  expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
});

test("모르는 유형은 400", async () => {
  const res = await post({ type: "ADMIN", name: "관리자" });
  expect(res.status).toBe(400);
  expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
});

// ---- ② 중복 유형 409 ----

test("이미 가진 유형을 또 만들면 409", async () => {
  await createLoggedInUser(ProfileType.LANDLORD);

  const res = await post({ type: "LANDLORD" });
  expect(res.status).toBe(409);
  expect((await res.json()).error.code).toBe("CONFLICT");
  expect(await prisma.profile.count()).toBe(1);
});

test("가입 티켓의 번호가 이미 같은 유형 프로필을 가진 계정이면 409 (티켓은 보존)", async () => {
  await prisma.user.create({
    data: { phone: NEW_PHONE, name: "박세입", profiles: { create: { type: ProfileType.TENANT } } },
  });
  const signupTicket = await issueSignupTicket();

  const res = await post({ type: "TENANT", name: "박세입", signupTicket });
  expect(res.status).toBe(409);
  expect(await prisma.otpCode.count()).toBe(1);
});

// ---- ③ 가입 티켓 플로우 ----

test("가입 티켓으로 User + 프로필 생성 후 세션까지 발급한다", async () => {
  const signupTicket = await issueSignupTicket();

  const res = await post({ type: "LANDLORD", name: "새임대", signupTicket });
  expect(res.status).toBe(201);

  const body = await res.json();
  expect(body.profile.type).toBe("LANDLORD");
  expect(body.me.user.phone).toBe(NEW_PHONE);
  expect(body.me.activeProfile.id).toBe(body.profile.id);
  expect(body.redirectTo).toBe("/");

  // 세션 쿠키 = DB Session 레코드
  const cookie = getTestCookie(SESSION_COOKIE);
  expect(cookie?.httpOnly).toBe(true);
  const session = await prisma.session.findUniqueOrThrow({ where: { token: cookie!.value } });
  expect(session.userId).toBe(body.me.user.id);

  // 티켓은 1회용 — 소진되어 사라진다
  expect(await prisma.otpCode.count()).toBe(0);
});

test("소진한 가입 티켓은 다시 못 쓴다", async () => {
  const signupTicket = await issueSignupTicket();
  expect((await post({ type: "LANDLORD", name: "새임대", signupTicket })).status).toBe(201);

  resetTestCookies(); // 새 요청(비로그인)에서 같은 티켓을 다시 제시
  const res = await post({ type: "TENANT", name: "새임대", signupTicket });

  expect(res.status).toBe(400);
  expect((await res.json()).error.code).toBe("SIGNUP_TICKET_INVALID");
  expect(await prisma.profile.count()).toBe(1);
});

test("만료된 가입 티켓은 거부한다", async () => {
  const otp = await prisma.otpCode.create({
    data: {
      phone: NEW_PHONE,
      code: "123456",
      verifiedAt: new Date(),
      expiresAt: new Date(Date.now() - 1000),
    },
  });

  const res = await post({ type: "LANDLORD", name: "새임대", signupTicket: otp.id });
  expect(res.status).toBe(400);
  expect((await res.json()).error.code).toBe("SIGNUP_TICKET_INVALID");
});

test("가입 플로우에서 이름이 없으면 400", async () => {
  const signupTicket = await issueSignupTicket();
  const res = await post({ type: "TENANT", signupTicket });

  expect(res.status).toBe(400);
  expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  expect(await prisma.otpCode.count()).toBe(1); // 티켓 보존
});

test("티켓도 세션도 없으면 401", async () => {
  const res = await post({ type: "TENANT", name: "박세입" });
  expect(res.status).toBe(401);
  expect((await res.json()).error.code).toBe("UNAUTHORIZED");
});

// ---- ④ 세입자 대기 계약 리다이렉트 판정 ----

test("세입자 + 내 번호로 등록된 대기 계약이 있으면 수락 화면으로 보낸다", async () => {
  await createPendingLease(NEW_PHONE);
  const signupTicket = await issueSignupTicket();

  const res = await post({ type: "TENANT", name: "홍미가", signupTicket });
  expect(res.status).toBe(201);
  expect((await res.json()).redirectTo).toBe("/tenant/leases/pending");
});

test("대기 계약이 다른 번호면 홈으로 보낸다", async () => {
  await createPendingLease("01012349999");
  const signupTicket = await issueSignupTicket();

  const res = await post({ type: "TENANT", name: "홍미가", signupTicket });
  expect((await res.json()).redirectTo).toBe("/");
});

test("대기 계약이 있어도 세입자가 아니면 홈으로 보낸다", async () => {
  await createPendingLease(NEW_PHONE);
  const signupTicket = await issueSignupTicket();

  const res = await post({ type: "LANDLORD", name: "홍미가", signupTicket });
  expect((await res.json()).redirectTo).toBe("/");
});

// ---- ⑤ 로그인 상태 프로필 추가 ----

test("로그인 상태면 기존 User 에 유형별 Detail 과 함께 프로필을 붙인다", async () => {
  const user = await createLoggedInUser(ProfileType.LANDLORD);

  const res = await post({ type: "MASTER", master: masterDetail });
  expect(res.status).toBe(201);

  const body = await res.json();
  expect(body.me.user.id).toBe(user.id);
  expect(body.me.profiles).toHaveLength(2);
  expect(body.profile.masterDetail.categories).toEqual(["REPAIR", "CLEANING"]);
  // 새로 만든 프로필로 전환된다
  expect(body.me.activeProfile.id).toBe(body.profile.id);

  const detail = await prisma.masterDetail.findUniqueOrThrow({
    where: { profileId: body.profile.id },
  });
  expect(detail.companyName).toBe("성수홈케어");
});

test("중개인 프로필은 사무소 좌표·반경까지 저장한다", async () => {
  await createLoggedInUser(ProfileType.TENANT);

  const res = await post({ type: "REALTOR", realtor: { ...realtorDetail, licenseNo: "12345" } });
  expect(res.status).toBe(201);

  const body = await res.json();
  expect(body.profile.realtorDetail).toMatchObject({
    officeName: "왕십리부동산",
    licenseNo: "12345",
    lat: 37.56133,
    lng: 127.03782,
    radiusKm: 3,
  });
});

test("이름을 함께 보내면 계정 이름도 갱신한다", async () => {
  const user = await createLoggedInUser(ProfileType.LANDLORD);

  const res = await post({ type: "TENANT", name: "김임대세입" });
  expect(res.status).toBe(201);
  expect((await res.json()).me.user.name).toBe("김임대세입");

  const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  expect(updated.name).toBe("김임대세입");
});
