"use server";

/**
 * 어드민 → web 발송 이력 조회 호출 (T6.3). 세션 쿠키만 실어 보낸다(`_shell/auth.ts` 참고).
 */
import { callWebAsAdmin, requireAdminGate } from "../_shell/auth";
import type { AdminMessageList, MessageListResult } from "./shared";

export async function fetchAdminMessages(
  query: Record<string, string>,
): Promise<MessageListResult> {
  const denied = await requireAdminGate();
  if (denied) return denied;

  const search = new URLSearchParams(query).toString();
  const result = await callWebAsAdmin(`/api/admin/messages${search ? `?${search}` : ""}`, {
    method: "GET",
  });
  if (!result.ok) return result;
  return { ok: true, ...(result.body as AdminMessageList) };
}
