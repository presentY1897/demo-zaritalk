/**
 * 민원 권한 판정 테스트 (T2.6) — **DB 없이 돈다**(순수 함수).
 *
 * `resolveComplaintParty` 는 화면과 API 가 함께 쓰는 **판정의 단일 출처**다.
 * 여기서 규칙 전체를 못 박아 두면, 라우트 테스트는 "그 판정이 401·403·404 로 옮겨지는지"만 보면 된다.
 */
import { ProfileType } from "@zari/db";
import { expect, test } from "vitest";
import { resolveComplaintParty, toPartyTarget, type ComplaintPartyTarget } from "./ownership";

const TENANT_PROFILE = "profile-tenant";
const OWNER_PROFILE = "profile-owner";
const OTHER_TENANT = "profile-other-tenant";
const OTHER_OWNER = "profile-other-owner";

const target: ComplaintPartyTarget = {
  leaseTenantProfileId: TENANT_PROFILE,
  complaintTenantProfileId: TENANT_PROFILE,
  ownerProfileId: OWNER_PROFILE,
};

const tenant = (id = TENANT_PROFILE) => [{ id, type: ProfileType.TENANT }];
const landlord = (id = OWNER_PROFILE) => [{ id, type: ProfileType.LANDLORD }];

test("계약의 세입자는 TENANT 로 판정된다", () => {
  expect(resolveComplaintParty(tenant(), target)).toEqual({
    party: "TENANT",
    profileId: TENANT_PROFILE,
  });
});

test("건물 주인은 LANDLORD 로 판정된다", () => {
  expect(resolveComplaintParty(landlord(), target)).toEqual({
    party: "LANDLORD",
    profileId: OWNER_PROFILE,
  });
});

test("제3자(다른 세입자·다른 임대인)는 null — 라우트에서 403 이 된다", () => {
  expect(resolveComplaintParty(tenant(OTHER_TENANT), target)).toBeNull();
  expect(resolveComplaintParty(landlord(OTHER_OWNER), target)).toBeNull();
  expect(resolveComplaintParty([], target)).toBeNull();
});

test("id 가 같아도 프로필 유형이 다르면 통과하지 못한다", () => {
  // 임대인 프로필 id 가 우연히 세입자 id 와 같아도 유형까지 함께 본다
  expect(
    resolveComplaintParty([{ id: TENANT_PROFILE, type: ProfileType.LANDLORD }], target),
  ).toBeNull();
  expect(
    resolveComplaintParty([{ id: OWNER_PROFILE, type: ProfileType.TENANT }], target),
  ).toBeNull();
});

test("계약 연결이 끊겨도 접수자 본인은 계속 볼 수 있다", () => {
  const detached: ComplaintPartyTarget = { ...target, leaseTenantProfileId: null };
  expect(resolveComplaintParty(tenant(), detached)).toEqual({
    party: "TENANT",
    profileId: TENANT_PROFILE,
  });
});

test("계약의 세입자가 접수자와 달라도(계약이 넘어간 경우) 둘 다 볼 수 있다", () => {
  const handedOver: ComplaintPartyTarget = { ...target, leaseTenantProfileId: OTHER_TENANT };
  expect(resolveComplaintParty(tenant(), handedOver)?.party).toBe("TENANT"); // 접수자
  expect(resolveComplaintParty(tenant(OTHER_TENANT), handedOver)?.party).toBe("TENANT"); // 현재 세입자
});

test("한 계정이 이 계약의 세입자이자 이 건물의 임대인이면 임대인(넓은 쪽)으로 판정한다", () => {
  const both = [
    { id: TENANT_PROFILE, type: ProfileType.TENANT },
    { id: OWNER_PROFILE, type: ProfileType.LANDLORD },
  ];
  expect(resolveComplaintParty(both, target)?.party).toBe("LANDLORD");
});

test("판정 입력은 민원 행에서 뽑는다 — 세 개의 키가 전부다", () => {
  expect(
    toPartyTarget({
      tenantProfileId: TENANT_PROFILE,
      lease: {
        tenantProfileId: TENANT_PROFILE,
        unit: { building: { ownerProfileId: OWNER_PROFILE } },
      },
    }),
  ).toEqual(target);
});
