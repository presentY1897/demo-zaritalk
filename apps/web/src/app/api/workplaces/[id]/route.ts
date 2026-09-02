/**
 * `PATCH·DELETE /api/workplaces/[id]` — 근무지 수정·삭제 (T3.4).
 *
 * 권한은 `requireTenant` + `requireOwnWorkplace` — **본인 프로필 것만**(404·403).
 * 주소를 바꿀 때는 좌표를 함께 보내야 한다(스키마가 강제) — 주소와 좌표가 어긋나면
 * T3.5 통근시간이 엉뚱한 지점으로 계산된다.
 *
 * 근무지를 지우면 `CommuteCache` 가 `onDelete: Cascade` 로 함께 지워진다(스키마).
 */
import { prisma } from "@zari/db";
import { requireTenant } from "@/features/tenant/ownership";
import { requireOwnWorkplace } from "@/features/workplace/ownership";
import { toWorkplaceDto } from "@/features/workplace/queries";
import { updateWorkplaceSchema } from "@/features/workplace/schema";
import { fail, noContent, ok, parseJson } from "@/lib/api/response";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const tenant = await requireTenant();
  if (tenant.response) return tenant.response;

  const { id } = await context.params;
  const owned = await requireOwnWorkplace(tenant.data, id);
  if (owned.response) return owned.response;

  const parsed = await parseJson(request, updateWorkplaceSchema);
  if (parsed.response) return parsed.response;
  const input = parsed.data;

  if (input.label !== undefined && input.label !== owned.data.label) {
    const duplicate = await prisma.workplace.findFirst({
      where: { tenantProfileId: tenant.data.profile.id, label: input.label, NOT: { id } },
      select: { id: true },
    });
    if (duplicate) return fail("CONFLICT", `이미 있는 근무지입니다: ${input.label}`);
  }

  const row = await prisma.workplace.update({
    where: { id },
    data: {
      ...(input.label === undefined ? {} : { label: input.label }),
      ...(input.address === undefined ? {} : { address: input.address }),
      ...(input.lat === undefined ? {} : { lat: input.lat }),
      ...(input.lng === undefined ? {} : { lng: input.lng }),
    },
  });
  return ok({ workplace: toWorkplaceDto(row) });
}

export async function DELETE(_request: Request, context: Context): Promise<Response> {
  const tenant = await requireTenant();
  if (tenant.response) return tenant.response;

  const { id } = await context.params;
  const owned = await requireOwnWorkplace(tenant.data, id);
  if (owned.response) return owned.response;

  await prisma.workplace.delete({ where: { id } });
  return noContent();
}
