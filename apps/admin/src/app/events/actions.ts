"use server";

/**
 * 어드민 → web 이벤트 로그 조회 호출 (T6.3). 세션 쿠키만 실어 보낸다(`_shell/auth.ts` 참고).
 */
import { callWebAsAdmin, requireAdminGate } from "../_shell/auth";
import type { AdminEventList, EventListResult } from "./shared";

export async function fetchAdminEvents(query: Record<string, string>): Promise<EventListResult> {
  const denied = await requireAdminGate();
  if (denied) return denied;

  const search = new URLSearchParams(query).toString();
  const result = await callWebAsAdmin(`/api/admin/events${search ? `?${search}` : ""}`, {
    method: "GET",
  });
  if (!result.ok) return result;
  return { ok: true, ...(result.body as AdminEventList) };
}
