/**
 * `/events` — 트래킹 이벤트 로그 (T6.3).
 *
 * 이름·기간으로 좁히고 **시간대별 카운트 차트**(KST 0~23시)를 함께 본다. 차트는 페이지가 아니라
 * **필터를 적용한 전체**를 집계한 것이라 "1페이지만 보고 있는 그림" 이 아니다.
 *
 * `anonId`·`sessionId` 는 앞 8자리만 내려온다 — 같은 브라우저인지 비교하는 데는 충분하고
 * 전체 값은 굳이 화면에 둘 이유가 없다(`apps/web/src/features/admin/mask.ts`).
 */
import { css } from "styled-system/css";
import { firstParam, formatDateTime, hrefWith } from "../_shell/format";
import {
  DataTable,
  EmptyState,
  ErrorPanel,
  FilterForm,
  FilterTabs,
  PageHeader,
  Pagination,
  mutedTextStyle,
  numericCellStyle,
} from "../_shell/table";
import { HourlyChart } from "./HourlyChart";
import { fetchAdminEvents } from "./actions";
import { NAME_TAB_LIMIT } from "./shared";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const propsStyle = css({
  textStyle: "caption",
  color: "text.muted",
  fontFamily: "numeric",
  wordBreak: "break-all",
  maxW: "260px",
  display: "inline-block",
});

export default async function AdminEventsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const name = firstParam(params.name);
  const from = firstParam(params.from);
  const to = firstParam(params.to);
  const page = firstParam(params.page) ?? "1";
  const pageSize = firstParam(params.pageSize);
  const current = { name, from, to, page, pageSize };

  const result = await fetchAdminEvents({
    ...(name ? { name } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    page,
    ...(pageSize ? { pageSize } : {}),
  });

  const names = result.ok ? result.names : [];
  const totalAll = names.reduce((sum, row) => sum + row.count, 0);

  return (
    <main>
      <PageHeader
        title="이벤트 로그"
        badge="T6.3"
        description="자체 트래킹(TrackingEvent) 원본입니다. 기간은 KST 달력 기준이고 끝 날짜를 포함합니다."
      />

      <FilterTabs
        label="이벤트 이름"
        activeKey={name ?? "all"}
        tabs={[
          {
            key: "all",
            label: "전체",
            count: totalAll,
            href: hrefWith("/events", current, { name: undefined, page: 1 }),
          },
          ...names.slice(0, NAME_TAB_LIMIT).map((row) => ({
            key: row.name,
            label: row.name,
            count: row.count,
            href: hrefWith("/events", current, { name: row.name, page: 1 }),
          })),
        ]}
      />

      <FilterForm
        action="/events"
        hidden={{ name }}
        fields={[
          { name: "from", label: "시작일(KST)", defaultValue: result.ok ? result.range.from : (from ?? ""), type: "date" },
          { name: "to", label: "종료일(KST)", defaultValue: result.ok ? result.range.to : (to ?? ""), type: "date" },
        ]}
        resetHref="/events"
        submitLabel="적용"
      />

      {!result.ok ? (
        <ErrorPanel message={result.message} />
      ) : (
        <>
          <HourlyChart
            hourly={result.hourly}
            range={result.range}
            sampled={result.sampled}
            truncated={result.sampleTruncated}
          />

          {result.events.length === 0 ? (
            <EmptyState message="조건에 맞는 이벤트가 없습니다." />
          ) : (
            <>
              <DataTable
                head={
                  <tr>
                    <th>시각(KST)</th>
                    <th>이름</th>
                    <th>경로</th>
                    <th>회원</th>
                    <th>anonId</th>
                    <th>props</th>
                  </tr>
                }
              >
                {result.events.map((event) => (
                  <tr key={event.id} data-testid="admin-event-row">
                    <td className={numericCellStyle}>{formatDateTime(event.createdAt)}</td>
                    <td>{event.name}</td>
                    <td className={mutedTextStyle}>{event.path ?? "—"}</td>
                    <td>{event.userName ?? <span className={mutedTextStyle}>비로그인</span>}</td>
                    <td className={numericCellStyle}>{event.anonId}</td>
                    <td>
                      {event.props ? (
                        <span className={propsStyle}>{event.props}</span>
                      ) : (
                        <span className={mutedTextStyle}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </DataTable>

              <Pagination
                page={result.page}
                hrefFor={(next) => hrefWith("/events", current, { page: next })}
              />
            </>
          )}
        </>
      )}
    </main>
  );
}
