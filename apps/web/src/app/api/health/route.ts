import { prisma } from "@zari/db";

/**
 * 배포 확인용 헬스체크 (T0.1).
 *
 * DB 장애 시 다른 라우트는 빈 500 만 내서 밖에서 원인을 구분할 수 없다 —
 * 환경변수가 없는 건지, 붙었는데 실패하는 건지, 스키마가 안 맞는 건지.
 * 여기서는 **자격증명을 흘리지 않는 선에서** 그 셋을 구분할 수 있게 해 준다.
 */
export const dynamic = "force-dynamic";

/** 에러 메시지에 커넥션 문자열이 섞여 들어가도 자격증명은 지운다. */
function safeMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/postgres(ql)?:\/\/[^\s"']+/gi, "postgresql://<redacted>");
}

/** 호스트·DB 이름만 남긴다 — 사용자·비밀번호는 뺀다. */
function describeTarget(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return "(파싱 불가 — 값에 따옴표가 섞여 있지 않은지 확인)";
  }
}

export async function GET(): Promise<Response> {
  const url = process.env.DATABASE_URL;
  const base = {
    databaseUrlConfigured: Boolean(url),
    target: describeTarget(url),
  };

  if (!url) {
    return Response.json(
      { ok: false, db: "unconfigured", ...base },
      { status: 503 },
    );
  }

  try {
    const rows = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) AS count FROM "User"
    `;
    return Response.json({ ok: true, db: "up", ...base, users: Number(rows[0]?.count ?? 0) });
  } catch (error) {
    return Response.json(
      { ok: false, db: "down", ...base, error: safeMessage(error) },
      { status: 503 },
    );
  }
}
