/**
 * 근무지 조회 (T3.4) — **서버 전용**(`@zari/db` 를 쓴다).
 *
 * 라우트 핸들러와 서버 컴포넌트가 **같은 함수**를 쓴다(T1.1·T1.3 과 같은 규약).
 * **T3.5(통근시간)가 기준점 목록으로 이 함수를 재사용한다** — `(호실, 근무지)` 쌍을 만들 때
 * 근무지 쪽 입력이 여기서 나온다.
 */
import { prisma } from "@zari/db";
import type { WorkplaceDto } from "./types";

type WorkplaceRow = {
  id: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
  createdAt: Date;
};

export function toWorkplaceDto(row: WorkplaceRow): WorkplaceDto {
  return {
    id: row.id,
    label: row.label,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    createdAt: row.createdAt.toISOString(),
  };
}

/** 내 근무지 목록 — 먼저 등록한 것부터 */
export async function listWorkplaces(tenantProfileId: string): Promise<WorkplaceDto[]> {
  const rows = await prisma.workplace.findMany({
    where: { tenantProfileId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toWorkplaceDto);
}

/** 근무지 1곳(생성·수정 응답용) */
export async function getWorkplace(id: string): Promise<WorkplaceDto | null> {
  const row = await prisma.workplace.findUnique({ where: { id } });
  return row ? toWorkplaceDto(row) : null;
}

/** 등록 개수 — 상한(`WORKPLACE_MAX`) 판정에 쓴다 */
export function countWorkplaces(tenantProfileId: string): Promise<number> {
  return prisma.workplace.count({ where: { tenantProfileId } });
}
