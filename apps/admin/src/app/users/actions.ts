"use server";

/**
 * 어드민 → web 회원 조회 호출 (T6.3).
 *
 * **세션 쿠키만** 실어 보낸다(`callWebAsAdmin`) — 조회 화면은 언제나 "로그인한 그 관리자"
 * 로 동작해야 하므로 서비스 시크릿으로 넘어갈 여지를 두지 않는다. 근거는 `_shell/auth.ts`.
 *
 * 서버 액션은 레이아웃 게이트를 거치지 않고도 직접 호출될 수 있으므로 첫 줄에서
 * `requireAdminGate()` 를 부른다.
 */
import { callWebAsAdmin, requireAdminGate } from "../_shell/auth";
import type { AdminUserDetail, AdminUserList, UserDetailResult, UserListResult } from "./shared";

export async function fetchAdminUsers(query: Record<string, string>): Promise<UserListResult> {
  const denied = await requireAdminGate();
  if (denied) return denied;

  const search = new URLSearchParams(query).toString();
  const result = await callWebAsAdmin(`/api/admin/users${search ? `?${search}` : ""}`, {
    method: "GET",
  });
  if (!result.ok) return result;
  return { ok: true, ...(result.body as AdminUserList) };
}

export async function fetchAdminUserDetail(id: string): Promise<UserDetailResult> {
  const denied = await requireAdminGate();
  if (denied) return denied;

  const result = await callWebAsAdmin(`/api/admin/users/${encodeURIComponent(id)}`, {
    method: "GET",
  });
  if (!result.ok) return result;
  return { ok: true, ...(result.body as AdminUserDetail) };
}
