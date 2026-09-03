/**
 * `/messages` — 알림톡 시뮬 발송 이력 전체 (T6.3).
 *
 * 임대인 화면(T1.7)이 "내 건물" 로 좁혀 보는 것과 달리 여기는 전부 본다 — OTP·중개 요청·
 * 작업 의뢰까지. 종류·수신 번호·열람 여부로 좁히고, 각 행에 **알림톡 말풍선 미리보기**가 붙는다.
 *
 * 수신 번호는 마스킹돼 오고, **OTP 본문의 인증번호는 web 이 가려서 준다** —
 * 발송 로그를 보는 것만으로 남의 계정에 로그인할 수 있기 때문이다
 * (`apps/web/src/features/admin/mask.ts`).
 */
import { css } from "styled-system/css";
import { firstParam, formatDateTime, hrefWith } from "../_shell/format";
import {
  EmptyState,
  ErrorPanel,
  FilterForm,
  FilterTabs,
  PageHeader,
  Pagination,
  StatusBadge,
  mutedTextStyle,
} from "../_shell/table";
import { NoticeBubble } from "./NoticeBubble";
import { fetchAdminMessages } from "./actions";
import { OPENED_TABS } from "./shared";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const listStyle = css({ mt: "5", display: "flex", flexDirection: "column", gap: "4" });
const rowStyle = css({
  display: "grid",
  gridTemplateColumns: { base: "1fr", lg: "minmax(0, 1fr) minmax(0, 460px)" },
  gap: "4",
  alignItems: "start",
  bg: "bg.card",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "border",
  rounded: "card",
  p: "4",
});
const metaStyle = css({ display: "flex", flexDirection: "column", gap: "1", minW: 0 });
const metaTitleStyle = css({ textStyle: "subtitle", color: "text" });
const metaLineStyle = css({ textStyle: "caption", color: "text.muted" });
const badgeRowStyle = css({ display: "flex", gap: "2", alignItems: "center", flexWrap: "wrap" });

export default async function AdminMessagesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const kind = firstParam(params.kind);
  const opened = firstParam(params.opened);
  const q = firstParam(params.q);
  const page = firstParam(params.page) ?? "1";
  const pageSize = firstParam(params.pageSize);
  const current = { kind, opened, q, page, pageSize };

  const result = await fetchAdminMessages({
    ...(kind ? { kind } : {}),
    ...(opened ? { opened } : {}),
    ...(q ? { q } : {}),
    page,
    ...(pageSize ? { pageSize } : {}),
  });

  const kindCounts = result.ok ? result.kindCounts : [];
  const totalAll = kindCounts.reduce((sum, row) => sum + row.count, 0);

  return (
    <main>
      <PageHeader
        title="발송 이력"
        badge="T6.3"
        description="알림톡 시뮬레이터(MessageLog) 전체입니다. 실제 문자·알림톡은 나가지 않습니다 — 발송의 실체가 이 로그 한 줄입니다."
      />

      <FilterTabs
        label="발송 종류"
        activeKey={kind ?? "all"}
        tabs={[
          { key: "all", label: "전체", count: totalAll, href: hrefWith("/messages", current, { kind: undefined, page: 1 }) },
          ...kindCounts.map((row) => ({
            key: row.kind,
            label: row.label,
            count: row.count,
            href: hrefWith("/messages", current, { kind: row.kind, page: 1 }),
          })),
        ]}
      />

      <FilterTabs
        label="열람 여부"
        activeKey={opened ?? "all"}
        tabs={OPENED_TABS.map((tab) => ({
          key: tab.key,
          label: tab.label,
          count:
            !result.ok
              ? undefined
              : tab.value === "opened"
                ? result.openedCount
                : tab.value === "unopened"
                  ? result.unopenedCount
                  : result.openedCount + result.unopenedCount,
          href: hrefWith("/messages", current, { opened: tab.value, page: 1 }),
        }))}
      />

      <FilterForm
        action="/messages"
        hidden={{ kind, opened }}
        fields={[
          { name: "q", label: "수신 번호", defaultValue: q ?? "", placeholder: "010-2222-2222" },
        ]}
        resetHref="/messages"
      />

      {!result.ok ? (
        <ErrorPanel message={result.message} />
      ) : result.messages.length === 0 ? (
        <EmptyState message="조건에 맞는 발송이 없습니다." />
      ) : (
        <>
          <div className={listStyle}>
            {result.messages.map((message) => (
              <article key={message.id} className={rowStyle} data-testid="admin-message-row">
                <div className={metaStyle}>
                  <span className={badgeRowStyle}>
                    <StatusBadge label={message.kindLabel} tone="neutral" />
                    <StatusBadge
                      label={message.opened ? "열람" : "미열람"}
                      tone={message.opened ? "success" : "warning"}
                    />
                  </span>
                  <h2 className={metaTitleStyle}>{message.title}</h2>
                  <span className={metaLineStyle}>수신 {message.toPhone}</span>
                  <span className={metaLineStyle}>발송 {formatDateTime(message.sentAt)}</span>
                  <span className={metaLineStyle}>
                    열람 {message.openedAt ? formatDateTime(message.openedAt) : "—"}
                  </span>
                  {message.buildingName ? (
                    <span className={metaLineStyle}>
                      {message.buildingName} {message.unitLabel} · {message.tenantName}
                    </span>
                  ) : (
                    <span className={mutedTextStyle}>계약에 연결되지 않은 발송</span>
                  )}
                </div>
                <NoticeBubble
                  title={message.title}
                  body={message.body}
                  channel={message.kindLabel}
                  noticePath={message.noticePath}
                />
              </article>
            ))}
          </div>

          <Pagination
            page={result.page}
            hrefFor={(next) => hrefWith("/messages", current, { page: next })}
          />
        </>
      )}
    </main>
  );
}
