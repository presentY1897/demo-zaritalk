/**
 * 조회 화면 공용 조각 (T6.3) — 다섯 화면(`/users`·`/leases`·`/charges`·`/messages`·`/events`)이
 * 같은 머리말·필터 탭·검색창·페이지 이동을 쓴다.
 *
 * **클라이언트 JS 를 쓰지 않는다.** 필터는 `<a>` 링크, 검색은 `<form method="get">` 이라
 * 상태가 전부 URL 에 있다 — 새로고침·뒤로가기·링크 공유가 그냥 된다. 운영 화면에서 필터를
 * 공유하는 일이 잦은데(“이 조건으로 보세요”) 클라이언트 상태로 들고 있으면 그게 안 된다.
 *
 * 색은 전부 `@zari/ui` semantic 토큰 — 하드코딩 색상 0.
 */
import { Badge, type BadgeTone } from "@zari/ui";
import Link from "next/link";
import type { ReactNode } from "react";
import { css } from "styled-system/css";
import { formatCount, type PageMeta } from "./format";

// ---------- 머리말 ----------

const headStyle = css({ display: "flex", alignItems: "center", gap: "3", flexWrap: "wrap" });
const titleStyle = css({ textStyle: "headline", color: "text" });
const descStyle = css({ textStyle: "body", color: "text.muted", mt: "2", maxW: "820px" });

export function PageHeader({
  title,
  badge,
  description,
}: {
  title: string;
  badge?: string;
  description?: ReactNode;
}) {
  return (
    <div>
      <div className={headStyle}>
        <h1 className={titleStyle}>{title}</h1>
        {badge ? <Badge tone="brand">{badge}</Badge> : null}
      </div>
      {description ? <p className={descStyle}>{description}</p> : null}
    </div>
  );
}

// ---------- 오류 ----------

const errorStyle = css({
  mt: "6",
  bg: "danger.subtle",
  color: "danger.text",
  rounded: "card",
  px: "4",
  py: "3",
  textStyle: "body",
});

export function ErrorPanel({ message }: { message: string }) {
  return (
    <p className={errorStyle} role="alert" data-testid="admin-error">
      {message}
    </p>
  );
}

// ---------- 필터 탭 ----------

const tabsStyle = css({ display: "flex", flexWrap: "wrap", gap: "2", mt: "6" });
const tabStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "2",
  px: "3",
  py: "2",
  rounded: "pill",
  textStyle: "label",
  color: "text",
  bg: "bg.card",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "border",
  textDecoration: "none",
  _hover: { bg: "bg.subtle" },
});
const tabActiveStyle = css({
  bg: "primary.subtle",
  borderColor: "primary.border",
  fontWeight: "600",
});
const tabCountStyle = css({ textStyle: "caption", color: "text.muted", fontFamily: "numeric" });

export type FilterTab = { key: string; label: string; href: string; count?: number };

export function FilterTabs({
  tabs,
  activeKey,
  label,
}: {
  tabs: FilterTab[];
  activeKey: string;
  label: string;
}) {
  return (
    <nav className={tabsStyle} aria-label={label}>
      {tabs.map((tab) => {
        const active = tab.key === activeKey;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            className={active ? `${tabStyle} ${tabActiveStyle}` : tabStyle}
            aria-current={active ? "page" : undefined}
            data-testid={`filter-${tab.key}`}
          >
            <span>{tab.label}</span>
            {tab.count === undefined ? null : (
              <span className={tabCountStyle}>{formatCount(tab.count)}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

// ---------- 검색·기간 폼 ----------

const formStyle = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "flex-end",
  gap: "3",
  mt: "4",
});
const fieldStyle = css({ display: "flex", flexDirection: "column", gap: "1" });
const fieldLabelStyle = css({ textStyle: "caption", color: "text.muted" });
const inputStyle = css({
  h: "38px",
  px: "3",
  rounded: "field",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "border",
  bg: "bg.card",
  color: "text",
  textStyle: "body",
  minW: "160px",
  _focusVisible: { outlineWidth: "2px", outlineStyle: "solid", outlineColor: "border.focus" },
});
const submitStyle = css({
  h: "38px",
  px: "4",
  rounded: "button",
  bg: "primary",
  color: "primary.fg",
  textStyle: "label",
  fontWeight: "600",
  border: "none",
  cursor: "pointer",
  _hover: { bg: "primary.hover" },
});
const resetStyle = css({
  textStyle: "caption",
  color: "text.brand",
  textDecoration: "underline",
  alignSelf: "center",
});

export type FormField = {
  name: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  type?: "text" | "date";
};

/**
 * GET 폼 — 제출하면 브라우저가 그대로 쿼리스트링을 만들어 이동한다.
 * 폼에 없는 현재 필터는 `hidden` 으로 실어 보내야 유지된다(GET 폼은 기존 쿼리를 버린다).
 */
export function FilterForm({
  action,
  fields,
  hidden = {},
  resetHref,
  submitLabel = "검색",
}: {
  action: string;
  fields: FormField[];
  hidden?: Record<string, string | undefined>;
  resetHref?: string;
  submitLabel?: string;
}) {
  return (
    <form className={formStyle} action={action} method="get">
      {Object.entries(hidden).map(([name, value]) =>
        value === undefined || value === "" ? null : (
          <input key={name} type="hidden" name={name} value={value} />
        ),
      )}
      {fields.map((field) => (
        <label key={field.name} className={fieldStyle}>
          <span className={fieldLabelStyle}>{field.label}</span>
          <input
            className={inputStyle}
            type={field.type ?? "text"}
            name={field.name}
            defaultValue={field.defaultValue ?? ""}
            placeholder={field.placeholder}
            data-testid={`filter-input-${field.name}`}
          />
        </label>
      ))}
      <button type="submit" className={submitStyle}>
        {submitLabel}
      </button>
      {resetHref ? (
        <Link href={resetHref} className={resetStyle}>
          조건 초기화
        </Link>
      ) : null}
    </form>
  );
}

// ---------- 표 ----------

const tableWrapStyle = css({ mt: "5", overflowX: "auto", minW: 0 });
const tableStyle = css({
  w: "full",
  minW: "720px",
  borderCollapse: "collapse",
  textStyle: "body",
  color: "text",
});
const theadStyle = css({
  textStyle: "caption",
  color: "text.muted",
  textAlign: "left",
  "& th": {
    py: "2",
    px: "3",
    borderBottomWidth: "hairline",
    borderBottomStyle: "solid",
    borderColor: "border",
    fontWeight: "500",
    whiteSpace: "nowrap",
  },
});
const tbodyStyle = css({
  "& td": {
    py: "3",
    px: "3",
    borderBottomWidth: "hairline",
    borderBottomStyle: "solid",
    borderColor: "border",
    verticalAlign: "top",
  },
  "& tr:hover": { bg: "bg.subtle" },
});

export function DataTable({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className={tableWrapStyle}>
      <table className={tableStyle}>
        <thead className={theadStyle}>{head}</thead>
        <tbody className={tbodyStyle}>{children}</tbody>
      </table>
    </div>
  );
}

const numericCell = css({ fontFamily: "numeric", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" });
export const numericCellStyle = numericCell;

const mutedStyle = css({ color: "text.muted" });
export const mutedTextStyle = mutedStyle;

// ---------- 빈 상태 ----------

const emptyStyle = css({
  mt: "5",
  py: "10",
  textAlign: "center",
  textStyle: "body",
  color: "text.muted",
});

export function EmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className={emptyStyle} data-testid="admin-empty">
      <p>{message}</p>
      {action ? <p className={css({ mt: "2" })}>{action}</p> : null}
    </div>
  );
}

// ---------- 페이지 이동 ----------

const pagerStyle = css({
  mt: "5",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "3",
  flexWrap: "wrap",
});
const pagerInfoStyle = css({ textStyle: "caption", color: "text.muted", fontFamily: "numeric" });
const pagerLinksStyle = css({ display: "flex", gap: "2", alignItems: "center" });
const pagerLinkStyle = css({
  px: "3",
  py: "2",
  rounded: "field",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "border",
  bg: "bg.card",
  textStyle: "label",
  color: "text",
  textDecoration: "none",
  _hover: { bg: "bg.subtle" },
});
const pagerDisabledStyle = css({ color: "text.disabled", pointerEvents: "none", bg: "bg.subtle" });

/**
 * 번호 페이지 이동. 커서가 아니라 오프셋을 고른 이유는
 * `apps/web/src/features/admin/pagination.ts` 주석에 있다(전체 건수·페이지 점프가 필요해서).
 */
export function Pagination({
  page,
  hrefFor,
}: {
  page: PageMeta;
  hrefFor: (page: number) => string;
}) {
  const from = page.total === 0 ? 0 : (page.page - 1) * page.pageSize + 1;
  const to = Math.min(page.page * page.pageSize, page.total);

  return (
    <div className={pagerStyle}>
      <p className={pagerInfoStyle} data-testid="admin-page-info">
        전체 {formatCount(page.total)}건
        {page.total > 0 ? ` · ${formatCount(from)}–${formatCount(to)} 표시` : ""}
        {page.totalPages > 0 ? ` · ${page.page} / ${page.totalPages} 페이지` : ""}
      </p>
      <div className={pagerLinksStyle}>
        <Link
          href={page.hasPrev ? hrefFor(page.page - 1) : "#"}
          className={page.hasPrev ? pagerLinkStyle : `${pagerLinkStyle} ${pagerDisabledStyle}`}
          aria-disabled={!page.hasPrev}
          data-testid="admin-page-prev"
        >
          이전
        </Link>
        <Link
          href={page.hasNext ? hrefFor(page.page + 1) : "#"}
          className={page.hasNext ? pagerLinkStyle : `${pagerLinkStyle} ${pagerDisabledStyle}`}
          aria-disabled={!page.hasNext}
          data-testid="admin-page-next"
        >
          다음
        </Link>
      </div>
    </div>
  );
}

// ---------- 배지 ----------

export function StatusBadge({ label, tone }: { label: string; tone: string }) {
  return <Badge tone={tone as BadgeTone}>{label}</Badge>;
}
