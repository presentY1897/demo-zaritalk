"use server";

/**
 * 어드민 → web 청구·수납 조회 호출 (T6.3). 세션 쿠키만 실어 보낸다(`_shell/auth.ts` 참고).
 */
import { callWebAsAdmin, requireAdminGate } from "../_shell/auth";
import type { AdminChargeList, ChargeListResult } from "./shared";

export async function fetchAdminCharges(query: Record<string, string>): Promise<ChargeListResult> {
  const denied = await requireAdminGate();
  if (denied) return denied;

  const search = new URLSearchParams(query).toString();
  const result = await callWebAsAdmin(`/api/admin/charges${search ? `?${search}` : ""}`, {
    method: "GET",
  });
  if (!result.ok) return result;
  return { ok: true, ...(result.body as AdminChargeList) };
}
