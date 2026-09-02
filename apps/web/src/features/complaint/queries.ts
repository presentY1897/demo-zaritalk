/**
 * 민원 조회·DTO 매핑 (T2.6) — **서버 전용**(`@zari/db` 를 쓴다).
 *
 * 라우트 핸들러와 서버 컴포넌트가 **같은 함수**를 쓴다(T1.1 이 세운 규칙) —
 * 그래야 페이지가 내려주는 초기 데이터와 `GET /api/complaints` 응답 모양이 어긋나지 않는다.
 *
 * **권한 판정은 여기서 새로 하지 않는다.** 화면용 `getComplaintForViewer` 도
 * `features/complaint/ownership.ts` 의 `resolveComplaintParty` 를 그대로 부른다 —
 * 판정이 두 곳에 갈라지면 한쪽만 고쳐서 구멍이 난다.
 */
import { ComplaintStatus, LeaseStatus, prisma } from "@zari/db";
import type { SessionUser } from "@/lib/auth/session";
import { resolveComplaintParty, toPartyTarget, type ComplaintPartyMatch } from "./ownership";
import type {
  ComplaintDetailDto,
  ComplaintLeaseOptionDto,
  ComplaintMessageDto,
  ComplaintStatusValue,
  ComplaintSummaryDto,
} from "./types";

/** 상세·목록이 함께 쓰는 관계 — 판정 키(소유자·세입자)와 화면 문구가 전부 들어 있다 */
const complaintInclude = {
  tenantProfile: { include: { user: { select: { name: true } } } },
  lease: {
    include: {
      unit: {
        include: {
          building: { include: { ownerProfile: { include: { user: { select: { name: true } } } } } },
        },
      },
    },
  },
  messages: {
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
    include: { authorProfile: { include: { user: { select: { name: true } } } } },
  },
  workOrder: { select: { id: true } },
};

type ComplaintRow = {
  id: string;
  leaseId: string;
  tenantProfileId: string;
  title: string;
  body: string;
  photos: unknown;
  status: ComplaintStatusValue;
  createdAt: Date;
  updatedAt: Date;
  tenantProfile: { id: string; user: { name: string } };
  lease: {
    id: string;
    tenantName: string;
    /** 권한 판정 키 — `resolveComplaintParty` 가 읽는다 */
    tenantProfileId: string | null;
    unit: {
      id: string;
      label: string;
      building: {
        id: string;
        name: string;
        address: string;
        ownerProfileId: string;
        ownerProfile: { id: string; user: { name: string } };
      };
    };
  };
  messages: {
    id: string;
    authorProfileId: string;
    body: string;
    createdAt: Date;
    authorProfile: { id: string; user: { name: string } };
  }[];
  workOrder: { id: string } | null;
};

/**
 * `Complaint.photos` 는 `Json?` 이라 무엇이든 들어올 수 있다 — 문자열 배열만 통과시킨다.
 * (지금 접수 화면은 사진을 보내지 않으므로 항상 `[]` 다. T2.4 업로드가 붙으면 채워진다.)
 */
function toPhotoUrls(photos: unknown): string[] {
  if (!Array.isArray(photos)) return [];
  return photos.filter((photo): photo is string => typeof photo === "string");
}

/** 임대인 프로필 id 로 작성자 역할을 가른다 — 스레드에 참여할 수 있는 쪽은 둘뿐이다 */
function toMessageDto(
  message: ComplaintRow["messages"][number],
  ownerProfileId: string,
): ComplaintMessageDto {
  return {
    id: message.id,
    kind: "REPLY",
    authorProfileId: message.authorProfileId,
    authorRole: message.authorProfileId === ownerProfileId ? "LANDLORD" : "TENANT",
    authorName: message.authorProfile.user.name,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
  };
}

/**
 * 접수 본문을 스레드의 첫 말풍선으로 세운다.
 * `ComplaintMessage` 행을 따로 만들지 않는다 — 본문의 원본은 `Complaint.body` 하나뿐이다.
 */
function toOpeningMessage(row: ComplaintRow): ComplaintMessageDto {
  return {
    id: `opening:${row.id}`,
    kind: "OPENING",
    authorProfileId: row.tenantProfileId,
    authorRole: "TENANT",
    authorName: row.tenantProfile.user.name,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toComplaintSummary(row: ComplaintRow): ComplaintSummaryDto {
  const building = row.lease.unit.building;
  const lastMessage = row.messages.at(-1);
  return {
    id: row.id,
    leaseId: row.leaseId,
    title: row.title,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    messageCount: row.messages.length + 1, // 접수 본문 포함
    lastMessageAt: (lastMessage?.createdAt ?? row.createdAt).toISOString(),
    photos: toPhotoUrls(row.photos),
    tenantName: row.tenantProfile.user.name,
    landlordName: building.ownerProfile.user.name,
    unit: {
      id: row.lease.unit.id,
      label: row.lease.unit.label,
      buildingId: building.id,
      buildingName: building.name,
      buildingAddress: building.address,
    },
  };
}

export function toComplaintDetail(row: ComplaintRow): ComplaintDetailDto {
  const ownerProfileId = row.lease.unit.building.ownerProfileId;
  return {
    ...toComplaintSummary(row),
    body: row.body,
    messages: [
      toOpeningMessage(row),
      ...row.messages.map((message) => toMessageDto(message, ownerProfileId)),
    ],
    // Phase 5(T5.1)가 민원 → 작업 의뢰 전환을 만들면 여기에 id 가 실린다
    workOrderId: row.workOrder?.id ?? null,
  };
}

/** 민원 1건 상세. 없으면 null — **권한은 보지 않는다**(호출부가 가드를 먼저 통과시킨다) */
export async function getComplaintDetail(complaintId: string): Promise<ComplaintDetailDto | null> {
  const row = await prisma.complaint.findUnique({
    where: { id: complaintId },
    include: complaintInclude,
  });
  return row ? toComplaintDetail(row) : null;
}

/**
 * 화면(서버 컴포넌트)용 — 상세 + 내가 어느 쪽 당사자인지.
 * 볼 수 없으면 `null` 이고 화면은 `notFound()` 로 막는다(API 는 403 — T1.1 이 세운 규칙).
 */
export async function getComplaintForViewer(
  complaintId: string,
  user: SessionUser,
): Promise<{ complaint: ComplaintDetailDto; viewer: ComplaintPartyMatch } | null> {
  const row = await prisma.complaint.findUnique({
    where: { id: complaintId },
    include: complaintInclude,
  });
  if (!row) return null;

  // 판정은 API 가드와 **같은 함수**를 쓴다 — 화면 쪽에 규칙을 복사하지 않는다
  const viewer = resolveComplaintParty(user.profiles, toPartyTarget(row));
  if (!viewer) return null;

  return { complaint: toComplaintDetail(row), viewer };
}

/** 내가 접수한 민원 — 최근 활동 순(새 민원·새 답장이 위로) */
export async function listTenantComplaints(
  tenantProfileId: string,
): Promise<ComplaintSummaryDto[]> {
  const rows = await prisma.complaint.findMany({
    where: { tenantProfileId },
    include: complaintInclude,
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(toComplaintSummary);
}

/**
 * 내 건물의 민원 — 미확인(`OPEN`)이 먼저, 그다음 최근 활동 순.
 * 임대인 홈(T1.9)의 미확인 민원 배지가 세는 집합과 같은 조건(`lease.unit.building.ownerProfileId`)이다.
 */
export async function listLandlordComplaints(
  ownerProfileId: string,
): Promise<ComplaintSummaryDto[]> {
  const rows = await prisma.complaint.findMany({
    where: { lease: { unit: { building: { ownerProfileId } } } },
    include: complaintInclude,
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });
  const summaries = rows.map(toComplaintSummary);
  // 미확인(OPEN)을 위로 — 임대인 홈 배지를 누르고 들어온 사람이 찾는 것이 그것이다
  return summaries.sort((a, b) => {
    const openDiff =
      Number(b.status === ComplaintStatus.OPEN) - Number(a.status === ComplaintStatus.OPEN);
    return openDiff !== 0 ? openDiff : b.lastMessageAt.localeCompare(a.lastMessageAt);
  });
}

/** 접수 폼의 계약 선택지 — 내가 세입자로 연결된 진행 중(ACTIVE) 계약만 */
export async function listComplaintLeaseOptions(
  tenantProfileId: string,
): Promise<ComplaintLeaseOptionDto[]> {
  const leases = await prisma.lease.findMany({
    where: { tenantProfileId, status: LeaseStatus.ACTIVE },
    orderBy: { startDate: "asc" },
    include: {
      unit: {
        include: {
          building: { include: { ownerProfile: { include: { user: { select: { name: true } } } } } },
        },
      },
    },
  });
  return leases.map((lease) => ({
    leaseId: lease.id,
    unitLabel: lease.unit.label,
    buildingName: lease.unit.building.name,
    landlordName: lease.unit.building.ownerProfile.user.name,
  }));
}
