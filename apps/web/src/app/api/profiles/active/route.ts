/**
 * `POST /api/profiles/active` — 활성 프로필 전환 (T0.5).
 *
 * 활성 프로필은 쿠키 `zari_profile`(httpOnly 아님) 한 곳에만 있다. 이 핸들러가 쿠키를 갈아 끼우고
 * 응답으로 `GET /api/me` 와 **같은 모양**을 돌려준다 — 클라이언트가 `/api/me` 캐시를 그대로
 * 채우고, 셸(Jotai atom)은 응답의 `activeProfile.id` 로 즉시 탭바를 바꾼다.
 *
 * ```jsonc
 * // 요청
 * { "profileId": "cmf0…" }
 * // 200 — GET /api/me 와 같은 모양
 * { "user": { … }, "profiles": [ … ], "activeProfile": { "id": "cmf0…", "type": "TENANT", … } }
 * ```
 *
 * | 실패 | status · code |
 * |---|---|
 * | 비로그인 | 401 `UNAUTHORIZED` |
 * | `profileId` 누락·형식 오류 | 400 `VALIDATION_ERROR` |
 * | **타인 프로필 id** | 403 `FORBIDDEN` |
 * | 존재하지 않는 프로필 id | 404 `NOT_FOUND` |
 */
import { prisma } from "@zari/db";
import { z } from "zod";
import { fail, ok, parseJson } from "@/lib/api/response";
import { buildMeResponse } from "@/lib/auth/me";
import { getCurrentUser, setActiveProfile } from "@/lib/auth/session";

const bodySchema = z.object({
  profileId: z.string().min(1, "profileId 는 필수입니다."),
});

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요합니다.");

  const { data, response } = await parseJson(request, bodySchema);
  if (!data) return response;

  const mine = user.profiles.find((profile) => profile.id === data.profileId);
  if (!mine) {
    // 내 것이 아니면 "없는 id" 와 "남의 id" 를 구분해서 알려 준다.
    // (존재 여부만 확인 — 남의 프로필 내용은 응답에 절대 싣지 않는다)
    const exists = await prisma.profile.findUnique({
      where: { id: data.profileId },
      select: { id: true },
    });
    return exists
      ? fail("FORBIDDEN", "다른 사용자의 프로필로는 전환할 수 없습니다.")
      : fail("NOT_FOUND", "존재하지 않는 프로필입니다.");
  }

  await setActiveProfile(mine.id);
  return ok(await buildMeResponse(user));
}
