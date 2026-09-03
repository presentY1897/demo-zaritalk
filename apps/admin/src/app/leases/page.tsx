/**
 * `/leases` — 계약 조회 · 상태 필터 · **연체 계약 드릴다운** (T6.3).
 *
 * 행에 숫자가 두 개 나란히 붙는다:
 * - **연체 N건** — 저장된 청구 상태(`OVERDUE`). 목록의 「연체만」 필터가 쓰는 기준이다.
 * - **기한 경과 미납 N건** — 원장 엔진(`isDelinquent`)이 오늘 기준으로 판정한 것. **부분납을 포함**하므로
 *   앞 숫자보다 크거나 같다. 두 숫자가 다른 것이 정상이고, 그 차이가 곧 "부분납으로 밀린 달" 이다.
 *
 * 미납액·연체일수도 전부 엔진이 판정한 값이다 — 화면은 한 줄도 계산하지 않는다(T1.4 규칙).
 */
import Link from "next/link";
import { css } from "styled-system/css";
import { firstParam, formatCount, formatDate, formatKrw, hrefWith } from "../_shell/format";
import {
  DataTable,
  EmptyState,
  ErrorPanel,
  FilterForm,
  FilterTabs,
  PageHeader,
  Pagination,
  StatusBadge,
  mutedTextStyle,
  numericCellStyle,
} from "../_shell/table";
import { fetchAdminLeases } from "./actions";
import { LEASE_TABS } from "./shared";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const linkStyle = css({ color: "text.brand", textDecoration: "none", fontWeight: "600" });
const subStyle = css({ textStyle: "caption", color: "text.muted", display: "block" });
const dangerStyle = css({ color: "danger.text", fontWeight: "600" });

export default async function AdminLeasesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const q = firstParam(params.q);
  const status = firstParam(params.status);
  const overdue = firstParam(params.overdue);
  const page = firstParam(params.page) ?? "1";
  const pageSize = firstParam(params.pageSize);
  const current = { q, status, overdue, page, pageSize };

  const result = await fetchAdminLeases({
    ...(q ? { q } : {}),
    ...(status ? { status } : {}),
    ...(overdue ? { overdue } : {}),
    page,
    ...(pageSize ? { pageSize } : {}),
  });

  const counts = result.ok ? result.counts : {};
  const totalAll = Object.values(counts).reduce((sum, value) => sum + value, 0);

  return (
    <main>
      <PageHeader
        title="계약"
        badge="T6.3"
        description="상태로 좁히거나 「연체만」으로 드릴다운합니다. 연체·미납 숫자는 전부 원장 엔진(T1.4)이 오늘 기준으로 판정한 값입니다."
      />

      <FilterTabs
        label="계약 상태"
        activeKey={status ?? "all"}
        tabs={LEASE_TABS.map((tab) => ({
          key: tab.key,
          label: tab.label,
          count: tab.status ? (counts[tab.status] ?? 0) : totalAll,
          href: hrefWith("/leases", current, { status: tab.status, page: 1 }),
        }))}
      />

      <FilterTabs
        label="연체 드릴다운"
        activeKey={overdue ? "overdue" : "any"}
        tabs={[
          { key: "any", label: "전체 계약", href: hrefWith("/leases", current, { overdue: undefined, page: 1 }) },
          {
            key: "overdue",
            label: "연체만",
            count: result.ok ? result.overdueTotal : undefined,
            href: hrefWith("/leases", current, { overdue: "1", page: 1 }),
          },
        ]}
      />

      <FilterForm
        action="/leases"
        hidden={{ status, overdue }}
        fields={[
          {
            name: "q",
            label: "세입자 · 건물 · 호실",
            defaultValue: q ?? "",
            placeholder: "박세입 / 행당해피빌 / 201호",
          },
        ]}
        resetHref="/leases"
      />

      {!result.ok ? (
        <ErrorPanel message={result.message} />
      ) : result.leases.length === 0 ? (
        <EmptyState message="조건에 맞는 계약이 없습니다." />
      ) : (
        <>
          <DataTable
            head={
              <tr>
                <th>건물 · 호실</th>
                <th>임대인</th>
                <th>세입자</th>
                <th>상태</th>
                <th>보증금 / 월세</th>
                <th>납부일</th>
                <th>계약 기간</th>
                <th>연체</th>
                <th>원장</th>
              </tr>
            }
          >
            {result.leases.map((lease) => (
              <tr key={lease.id} data-testid="admin-lease-row">
                <td>
                  {lease.buildingName}
                  <span className={subStyle}>{lease.unitLabel}</span>
                </td>
                <td>{lease.landlordName}</td>
                <td>
                  {lease.tenantName}
                  <span className={`${subStyle} ${numericCellStyle}`}>{lease.tenantPhone}</span>
                  {lease.tenantLinked ? null : (
                    <span className={subStyle}>계정 미연결</span>
                  )}
                </td>
                <td>
                  <StatusBadge label={lease.statusLabel} tone={lease.statusTone} />
                </td>
                <td className={numericCellStyle}>
                  {formatKrw(lease.deposit)}
                  <span className={subStyle}>{formatKrw(lease.monthlyRent)} / 월</span>
                </td>
                <td className={numericCellStyle}>매월 {lease.paymentDay}일</td>
                <td className={numericCellStyle}>
                  {formatDate(lease.startDate)}
                  <span className={subStyle}>~ {formatDate(lease.endDate)}</span>
                </td>
                <td className={numericCellStyle}>
                  {lease.overdueCount === 0 && lease.delinquentCount === 0 ? (
                    <span className={mutedTextStyle}>없음</span>
                  ) : (
                    <>
                      <span className={dangerStyle}>연체 {formatCount(lease.overdueCount)}건</span>
                      <span className={subStyle}>
                        기한 경과 미납 {formatCount(lease.delinquentCount)}건 ·{" "}
                        {formatKrw(lease.outstandingAmount)}
                      </span>
                      <span className={subStyle}>최장 {lease.maxOverdueDays}일</span>
                    </>
                  )}
                </td>
                <td>
                  <Link href={`/charges?leaseId=${lease.id}`} className={linkStyle}>
                    청구 {lease.chargeCount}건
                  </Link>
                </td>
              </tr>
            ))}
          </DataTable>

          <Pagination
            page={result.page}
            hrefFor={(next) => hrefWith("/leases", current, { page: next })}
          />
        </>
      )}
    </main>
  );
}
