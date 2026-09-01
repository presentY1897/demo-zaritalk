/**
 * `PATCH /api/profiles/[id]` — 프로필 수정(유형별 Detail 포함) (T0.4).
 *
 * 유형(`Profile.type`)은 바꿀 수 없다 — `@@unique([userId, type])` 이라 유형 변경은
 * 사실상 다른 프로필이다. 그래서 **저장된 유형에 맞는 Detail** 만 검증·저장한다.
 * 남의 프로필이면 403 FORBIDDEN.
 */
import { prisma } from "@zari/db";
import { fail, ok, parseJson } from "@/lib/api/response";
import { updateProfileSchemaFor } from "@/features/profiles/schema";
import { buildMeResponse, type MeProfile } from "@/lib/auth/me";
import { getCurrentUser } from "@/lib/auth/session";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요합니다.");

  const { id } = await context.params;
  const profile = await prisma.profile.findUnique({ where: { id } });
  if (!profile) return fail("NOT_FOUND", "프로필을 찾을 수 없습니다.");
  if (profile.userId !== user.id) return fail("FORBIDDEN", "내 프로필만 수정할 수 있습니다.");

  // 유형이 정해져 있으므로 그 유형에 필요한 Detail 을 필수로 건다
  const parsed = await parseJson(request, updateProfileSchemaFor(profile.type));
  if (parsed.response) return parsed.response;
  const body = parsed.data;

  if (body.name && body.name !== user.name) {
    await prisma.user.update({ where: { id: user.id }, data: { name: body.name } });
  }

  // Detail 은 통째로 갈아 끼운다. 유형은 맞는데 Detail 행이 없던 데이터도 upsert 로 살린다.
  const updated = await prisma.profile.update({
    where: { id },
    data: {
      ...(body.realtor
        ? { realtorDetail: { upsert: { create: body.realtor, update: body.realtor } } }
        : {}),
      ...(body.master
        ? { masterDetail: { upsert: { create: body.master, update: body.master } } }
        : {}),
    },
    include: { realtorDetail: true, masterDetail: true },
  });

  const refreshed = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    include: { profiles: { orderBy: { createdAt: "asc" } } },
  });

  const meProfile: MeProfile = {
    id: updated.id,
    type: updated.type,
    createdAt: updated.createdAt,
    realtorDetail: updated.realtorDetail,
    masterDetail: updated.masterDetail,
  };

  return ok({ profile: meProfile, me: await buildMeResponse(refreshed) });
}
