import type { ProfileType } from "@zari/db";
import { expect, test } from "vitest";
import { activeTabKey, homeHrefFor, MY_PAGE_HREF, PROFILE_TABS } from "./tabs";

/**
 * 탭바 구성은 T0.5 task 문서의 표가 원본이다. 화면이 붙기 전에 구성이 조용히 바뀌면
 * 뒤 Phase 가 엉뚱한 경로에 화면을 만들게 되므로 여기서 고정해 둔다.
 */
const EXPECTED_LABELS: Record<ProfileType, string[]> = {
  LANDLORD: ["홈", "자산", "중개요청", "커뮤니티", "마이"],
  TENANT: ["홈", "매물", "환급", "커뮤니티", "마이"],
  REALTOR: ["홈", "매물", "커뮤니티", "마이"],
  MASTER: ["홈", "견적", "커뮤니티", "마이"],
};

test("프로필 유형별 탭 구성이 task 문서 표와 같다", () => {
  for (const [type, labels] of Object.entries(EXPECTED_LABELS)) {
    const tabs = PROFILE_TABS[type as ProfileType];
    expect(tabs.map((tab) => tab.label), type).toEqual(labels);
  }
});

test("모든 프로필의 마지막 탭은 마이페이지, 탭 경로·key 는 유형 안에서 유일하다", () => {
  for (const type of Object.keys(EXPECTED_LABELS) as ProfileType[]) {
    const tabs = PROFILE_TABS[type];
    expect(tabs.at(-1)?.href, type).toBe(MY_PAGE_HREF);
    expect(new Set(tabs.map((tab) => tab.href)).size, type).toBe(tabs.length);
    expect(new Set(tabs.map((tab) => tab.key)).size, type).toBe(tabs.length);
  }
});

test("모든 탭 경로는 절대 경로이고 담당 task 가 적혀 있다", () => {
  for (const tabs of Object.values(PROFILE_TABS)) {
    for (const tab of tabs) {
      expect(tab.href.startsWith("/"), tab.href).toBe(true);
      expect(tab.owner, tab.href).toMatch(/^T\d+\.\d+$/);
    }
  }
});

test("홈 경로는 프로필 유형별 첫 탭 — 로그인 직후 `/` 가 여기로 보낸다", () => {
  expect(homeHrefFor("LANDLORD")).toBe("/landlord");
  expect(homeHrefFor("TENANT")).toBe("/tenant");
  expect(homeHrefFor("REALTOR")).toBe("/realtor");
  expect(homeHrefFor("MASTER")).toBe("/master");
});

test("활성 탭은 가장 길게 일치하는 경로로 고른다", () => {
  const tabs = PROFILE_TABS.LANDLORD;
  // /landlord 와 /landlord/buildings 가 함께 있어도 자산 탭만 활성이 된다
  expect(activeTabKey(tabs, "/landlord")).toBe("home");
  expect(activeTabKey(tabs, "/landlord/buildings")).toBe("assets");
  expect(activeTabKey(tabs, "/landlord/buildings/abc123")).toBe("assets");
  expect(activeTabKey(tabs, "/community")).toBe("community");
  expect(activeTabKey(tabs, "/me")).toBe("me");
});

test("탭에 없는 경로면 활성 탭이 없다", () => {
  expect(activeTabKey(PROFILE_TABS.TENANT, "/notice/abc")).toBeNull();
  // 접두사만 겹치는 다른 경로를 활성으로 잘못 잡지 않는다
  expect(activeTabKey(PROFILE_TABS.TENANT, "/searchers")).toBeNull();
});
