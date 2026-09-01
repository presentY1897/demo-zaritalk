/**
 * `POST /api/auth/demo-login` — 역할별 원클릭 데모 로그인.
 *
 * 역할 키(landlord|tenant|realtor|master)를 시드 계정 전화번호로 바꿔 조회하고
 * 바로 세션을 발급한다. 인증 절차를 건너뛰는 데모 전용 입구다.
 * 시드가 없는 DB면 404(`NOT_FOUND`) — `pnpm db:seed` 안내용.
 */
import { prisma } from "@zari/db";
import { z } from "zod";
import { fail, ok, parseJson } from "@/lib/api/response";
import { DEMO_ACCOUNTS, DEMO_ROLES } from "@/lib/auth/demo-accounts";
import { buildMeResponse } from "@/lib/auth/me";
import { loginUser } from "@/lib/auth/session";

const bodySchema = z.object({ role: z.enum(DEMO_ROLES) });

export async function POST(request: Request): Promise<Response> {
  const parsed = await parseJson(request, bodySchema);
  if (parsed.response) return parsed.response;

  const account = DEMO_ACCOUNTS[parsed.data.role];
  const user = await prisma.user.findUnique({
    where: { phone: account.phone },
    include: { profiles: { orderBy: { createdAt: "asc" } } },
  });

  if (!user) {
    return fail(
      "NOT_FOUND",
      `데모 계정(${account.label} ${account.name})이 없습니다. 시드를 먼저 실행해 주세요.`,
    );
  }

  // 역할과 같은 유형의 프로필을 활성으로 잡아 준다(하단 탭바 — T0.5)
  await loginUser(user, account.profileType);
  return ok(await buildMeResponse(user));
}
