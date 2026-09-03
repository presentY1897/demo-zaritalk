/**
 * `/users/[id]` — 회원 상세: 프로필 · 계약 · **신청 이력 타임라인** (T6.3).
 *
 * 타임라인은 전용 감사 로그 테이블이 없어(스키마를 늘리지 않았다) 각 도메인의 시각 컬럼을
 * web 에서 합쳐 만든 것이다 — 가입·프로필 추가·계약·환급 신청·민원·신고·수신한 발송.
 *
 * `params` 는 Next 16 규약대로 Promise 다.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@zari/ui";
import { css } from "styled-system/css";
import { formatDate, formatDateTime, formatKrw, PROFILE_TYPE_LABEL } from "../../_shell/format";
import { DataTable, ErrorPanel, PageHeader, StatusBadge, mutedTextStyle, numericCellStyle } from "../../_shell/table";
import { fetchAdminUserDetail } from "../actions";
import { TIMELINE_TONE } from "../shared";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

const backStyle = css({ textStyle: "caption", color: "text.brand", textDecoration: "none" });
const gridStyle = css({
  mt: "6",
  display: "grid",
  gridTemplateColumns: { base: "1fr", xl: "minmax(0, 1fr) minmax(0, 1fr)" },
  gap: "4",
  alignItems: "start",
});
const sectionTitleStyle = css({ textStyle: "subtitle", color: "text", mb: "3" });
const rowStyle = css({
  display: "flex",
  justifyContent: "space-between",
  gap: "3",
  py: "1.5",
  textStyle: "body",
});
const rowLabelStyle = css({ color: "text.muted" });
const listStyle = css({ display: "flex", flexDirection: "column", gap: "3" });
const timelineItemStyle = css({
  display: "grid",
  gridTemplateColumns: "auto 1fr",
  gap: "3",
  alignItems: "start",
  py: "2",
  borderBottomWidth: "hairline",
  borderBottomStyle: "solid",
  borderColor: "border",
  _last: { borderBottomWidth: "0" },
});
const timelineWhenStyle = css({
  textStyle: "caption",
  color: "text.muted",
  fontFamily: "numeric",
  whiteSpace: "nowrap",
});
const timelineTitleStyle = css({ textStyle: "body", color: "text" });
const timelineDescStyle = css({ textStyle: "caption", color: "text.muted", mt: "0.5" });
const truncatedStyle = css({ textStyle: "caption", color: "text.muted", mt: "3" });

export default async function AdminUserDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const result = await fetchAdminUserDetail(id);

  if (!result.ok && result.status === 404) notFound();
  if (!result.ok) {
    return (
      <main>
        <PageHeader title="회원 상세" badge="T6.3" />
        <ErrorPanel message={result.message} />
      </main>
    );
  }

  const { user, profiles, leases, timeline, timelineTruncated } = result;

  return (
    <main>
      <Link href="/users" className={backStyle}>
        ← 회원 목록
      </Link>
      <div className={css({ mt: "2" })}>
        <PageHeader title={user.name} badge={user.isAdmin ? "관리자" : undefined} />
      </div>

      <div className={gridStyle}>
        <Card padding="lg">
          <h2 className={sectionTitleStyle}>기본 정보</h2>
          <div className={rowStyle}>
            <span className={rowLabelStyle}>전화번호</span>
            <span className={numericCellStyle}>{user.phone}</span>
          </div>
          <div className={rowStyle}>
            <span className={rowLabelStyle}>가입일</span>
            <span className={numericCellStyle}>{formatDateTime(user.createdAt)}</span>
          </div>
          <div className={rowStyle}>
            <span className={rowLabelStyle}>환급 신청</span>
            <span className={numericCellStyle}>{user.refundCount}건</span>
          </div>

          <h2 className={css({ textStyle: "subtitle", color: "text", mt: "6", mb: "3" })}>프로필</h2>
          {profiles.length === 0 ? (
            <p className={mutedTextStyle}>프로필이 없습니다(온보딩 전).</p>
          ) : (
            <div className={listStyle}>
              {profiles.map((profile) => (
                <div key={profile.id} data-testid="admin-user-profile">
                  <StatusBadge label={PROFILE_TYPE_LABEL[profile.type] ?? profile.type} tone="neutral" />
                  <span className={css({ ml: "2", textStyle: "caption", color: "text.muted" })}>
                    {formatDate(profile.createdAt)} 생성
                  </span>
                  {profile.detail ? <p className={timelineDescStyle}>{profile.detail}</p> : null}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card padding="lg">
          <h2 className={sectionTitleStyle}>이력 타임라인</h2>
          {timeline.length === 0 ? (
            <p className={mutedTextStyle}>기록이 없습니다.</p>
          ) : (
            <div>
              {timeline.map((entry) => (
                <div key={entry.id} className={timelineItemStyle} data-testid="admin-timeline-entry">
                  <span className={timelineWhenStyle}>{formatDateTime(entry.at)}</span>
                  <div>
                    <StatusBadge label={entry.kindLabel} tone={TIMELINE_TONE[entry.kind] ?? "neutral"} />
                    <p className={timelineTitleStyle}>{entry.title}</p>
                    {entry.description ? (
                      <p className={timelineDescStyle}>{entry.description}</p>
                    ) : null}
                  </div>
                </div>
              ))}
              {timelineTruncated ? (
                <p className={truncatedStyle}>최근 기록만 보여 줍니다(오래된 항목은 잘렸습니다).</p>
              ) : null}
            </div>
          )}
        </Card>
      </div>

      <h2 className={css({ textStyle: "subtitle", color: "text", mt: "8" })}>계약</h2>
      {leases.length === 0 ? (
        <p className={css({ mt: "2", textStyle: "body", color: "text.muted" })}>
          연결된 계약이 없습니다.
        </p>
      ) : (
        <DataTable
          head={
            <tr>
              <th>역할</th>
              <th>건물 · 호실</th>
              <th>상대방</th>
              <th>상태</th>
              <th>보증금</th>
              <th>월세</th>
              <th>기간</th>
              <th>청구</th>
            </tr>
          }
        >
          {leases.map((lease) => (
            <tr key={`${lease.role}-${lease.id}`} data-testid="admin-user-lease">
              <td>{lease.role === "TENANT" ? "세입자" : "임대인"}</td>
              <td>
                {lease.buildingName} {lease.unitLabel}
              </td>
              <td>{lease.counterpartName}</td>
              <td>
                <StatusBadge label={lease.statusLabel} tone={lease.statusTone} />
              </td>
              <td className={numericCellStyle}>{formatKrw(lease.deposit)}</td>
              <td className={numericCellStyle}>{formatKrw(lease.monthlyRent)}</td>
              <td className={numericCellStyle}>
                {formatDate(lease.startDate)} ~ {formatDate(lease.endDate)}
              </td>
              <td>
                <Link href={`/charges?leaseId=${lease.id}`} className={css({ color: "text.brand" })}>
                  원장 보기
                </Link>
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </main>
  );
}
