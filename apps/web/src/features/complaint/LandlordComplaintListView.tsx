"use client";

/**
 * `/landlord/complaints` 임대인 민원 목록 (T2.6).
 *
 * **task 문서 표에는 없는 화면이다.** 임대인은 홈(T1.9)의 「새 민원 N건」 배지에서 상세로 바로
 * 들어오는데, 상세에 「민원 목록」 링크가 있는데 목적지가 없으면 404 로 빠진다. 그래서
 * 배지가 가리키지 않는 나머지 민원(진행중·해결·반려)까지 볼 수 있는 **최소 목록**만 둔다 —
 * 필터·검색·페이지네이션은 없다. 미확인(`OPEN`)이 위로 올라오는 정렬만 한다
 * (정렬 규칙은 `features/complaint/queries.ts` 의 `listLandlordComplaints`).
 */
import { Badge, Card, CardHeader } from "@zari/ui";
import Link from "next/link";
import { css } from "styled-system/css";
import { useComplaints } from "./hooks";
import { COMPLAINT_STATUS_META } from "./status";
import type { ComplaintSummaryDto } from "./types";

const pageStyle = css({
  px: "gutter",
  py: "section",
  display: "flex",
  flexDirection: "column",
  gap: "gutter",
});
const titleStyle = css({ textStyle: "headline", color: "text" });
const captionStyle = css({ textStyle: "caption", color: "text.muted", mt: "1" });
const listStyle = css({ display: "flex", flexDirection: "column", gap: "3" });
const cardLinkStyle = css({ textDecoration: "none", color: "inherit", display: "block" });
const metaRowStyle = css({ mt: "2", textStyle: "caption", color: "text.muted" });
const emptyStyle = css({
  p: "6",
  rounded: "card",
  borderWidth: "hairline",
  borderStyle: "dashed",
  borderColor: "border",
  textAlign: "center",
  textStyle: "body",
  color: "text.muted",
});

function formatMoment(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function LandlordComplaintListView({
  initialComplaints,
}: {
  initialComplaints: ComplaintSummaryDto[];
}) {
  const { data: complaints = initialComplaints } = useComplaints("LANDLORD", initialComplaints);
  const openCount = complaints.filter((complaint) => complaint.status === "OPEN").length;

  return (
    <main className={pageStyle}>
      <div>
        <h1 className={titleStyle}>민원</h1>
        <p className={captionStyle}>
          전체 {complaints.length}건 · 미확인 {openCount}건
        </p>
      </div>

      {complaints.length === 0 ? (
        <p className={emptyStyle} data-testid="complaint-empty">
          접수된 민원이 없습니다.
        </p>
      ) : (
        <div className={listStyle}>
          {complaints.map((complaint) => {
            const meta = COMPLAINT_STATUS_META[complaint.status];
            return (
              <Link
                key={complaint.id}
                href={`/landlord/complaints/${complaint.id}`}
                className={cardLinkStyle}
                data-testid="complaint-card"
                data-complaint-status={complaint.status}
              >
                <Card padding="md" interactive>
                  <CardHeader
                    title={complaint.title}
                    aside={<Badge tone={meta.tone}>{meta.label}</Badge>}
                  />
                  <p className={metaRowStyle}>
                    {complaint.unit.buildingName} {complaint.unit.label} · {complaint.tenantName} ·
                    대화 {complaint.messageCount} · {formatMoment(complaint.lastMessageAt)}
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
