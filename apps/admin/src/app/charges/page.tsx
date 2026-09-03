/**
 * `/charges` — 청구/수납 원장 조회 (T6.3).
 *
 * 상태 탭 · 연월 필터 · **계약 드릴다운**(`?leaseId=`). 계약 화면에서 「청구 N건」을 누르면
 * 이 화면이 그 계약으로 좁혀 열린다.
 *
 * 미납액·연체일수·연체 여부는 전부 원장 엔진(`@/lib/rent`)이 **`asOf`(KST 오늘)** 기준으로
 * 판정한 값이다. 화면 아래에 그 기준일을 밝혀 둔다 — "어제 본 숫자와 다르다" 를 설명해 준다.
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
import { fetchAdminCharges } from "./actions";
import { CHARGE_TABS } from "./shared";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const subStyle = css({ textStyle: "caption", color: "text.muted", display: "block" });
const dangerStyle = css({ color: "danger.text", fontWeight: "600" });
const drilldownStyle = css({
  mt: "4",
  bg: "info.subtle",
  color: "info.text",
  rounded: "card",
  px: "4",
  py: "3",
  textStyle: "body",
  display: "flex",
  justifyContent: "space-between",
  gap: "3",
  flexWrap: "wrap",
});
const asOfStyle = css({ mt: "3", textStyle: "caption", color: "text.muted" });

export default async function AdminChargesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const status = firstParam(params.status);
  const leaseId = firstParam(params.leaseId);
  const year = firstParam(params.year);
  const month = firstParam(params.month);
  const page = firstParam(params.page) ?? "1";
  const pageSize = firstParam(params.pageSize);
  const current = { status, leaseId, year, month, page, pageSize };

  const result = await fetchAdminCharges({
    ...(status ? { status } : {}),
    ...(leaseId ? { leaseId } : {}),
    ...(year ? { year } : {}),
    ...(month ? { month } : {}),
    page,
    ...(pageSize ? { pageSize } : {}),
  });

  const counts = result.ok ? result.counts : {};
  const totalAll = Object.values(counts).reduce((sum, value) => sum + value, 0);

  return (
    <main>
      <PageHeader
        title="청구/수납"
        badge="T6.3"
        description="월별 청구와 납부 원장입니다. 미납액·연체일수는 원장 엔진(T1.4)이 판정합니다 — 이 화면에는 계산식이 한 줄도 없습니다."
      />

      {result.ok && result.lease ? (
        <div className={drilldownStyle} data-testid="admin-charge-drilldown">
          <span>
            <strong>
              {result.lease.buildingName} {result.lease.unitLabel}
            </strong>{" "}
            · {result.lease.tenantName} · 청구 {result.lease.chargeCount}건 · 미납{" "}
            {formatKrw(result.lease.outstandingAmount)}
          </span>
          <Link href={hrefWith("/charges", current, { leaseId: undefined, page: 1 })}>
            드릴다운 해제
          </Link>
        </div>
      ) : null}

      <FilterTabs
        label="청구 상태"
        activeKey={status ?? "all"}
        tabs={CHARGE_TABS.map((tab) => ({
          key: tab.key,
          label: tab.label,
          count: tab.status ? (counts[tab.status] ?? 0) : totalAll,
          href: hrefWith("/charges", current, { status: tab.status, page: 1 }),
        }))}
      />

      <FilterForm
        action="/charges"
        hidden={{ status, leaseId }}
        fields={[
          { name: "year", label: "연도", defaultValue: year ?? "", placeholder: "2026" },
          { name: "month", label: "월", defaultValue: month ?? "", placeholder: "8" },
        ]}
        resetHref="/charges"
        submitLabel="적용"
      />

      {!result.ok ? (
        <ErrorPanel message={result.message} />
      ) : result.charges.length === 0 ? (
        <EmptyState message="조건에 맞는 청구가 없습니다." />
      ) : (
        <>
          <DataTable
            head={
              <tr>
                <th>청구 월</th>
                <th>건물 · 호실</th>
                <th>세입자</th>
                <th>상태</th>
                <th>납부기한</th>
                <th>청구액</th>
                <th>납부액</th>
                <th>미납</th>
                <th>계약</th>
              </tr>
            }
          >
            {result.charges.map((charge) => (
              <tr key={charge.id} data-testid="admin-charge-row">
                <td className={numericCellStyle}>
                  {charge.year}년 {charge.month}월
                  <span className={subStyle}>납부 {formatCount(charge.paymentCount)}건</span>
                </td>
                <td>
                  {charge.buildingName}
                  <span className={subStyle}>{charge.unitLabel}</span>
                </td>
                <td>
                  {charge.tenantName}
                  <span className={`${subStyle} ${numericCellStyle}`}>{charge.tenantPhone}</span>
                </td>
                <td>
                  <StatusBadge label={charge.statusLabel} tone={charge.statusTone} />
                  {charge.delinquent && charge.status !== "OVERDUE" ? (
                    <span className={subStyle}>기한 경과 미납</span>
                  ) : null}
                </td>
                <td className={numericCellStyle}>
                  {formatDate(charge.dueDate)}
                  {charge.overdueDays > 0 ? (
                    <span className={subStyle}>{charge.overdueDays}일 경과</span>
                  ) : null}
                </td>
                <td className={numericCellStyle}>
                  {formatKrw(charge.totalDue)}
                  <span className={subStyle}>
                    월세 {formatKrw(charge.rentAmount)} · 관리비 {formatKrw(charge.maintenanceAmount)}
                  </span>
                  {charge.carriedOverAmount > 0 || charge.lateFeeAmount > 0 ? (
                    <span className={subStyle}>
                      이월 {formatKrw(charge.carriedOverAmount)} · 연체료{" "}
                      {formatKrw(charge.lateFeeAmount)}
                    </span>
                  ) : null}
                </td>
                <td className={numericCellStyle}>{formatKrw(charge.paidAmount)}</td>
                <td className={numericCellStyle}>
                  {charge.outstanding === 0 ? (
                    <span className={mutedTextStyle}>0원</span>
                  ) : (
                    <span className={dangerStyle}>{formatKrw(charge.outstanding)}</span>
                  )}
                </td>
                <td>
                  <Link
                    href={hrefWith("/charges", {}, { leaseId: charge.leaseId })}
                    className={css({ color: "text.brand" })}
                  >
                    이 계약만
                  </Link>
                </td>
              </tr>
            ))}
          </DataTable>

          <p className={asOfStyle}>
            연체일수·미납액은 <strong>{formatDate(result.asOf)}</strong>(KST) 기준으로 원장 엔진이
            판정한 값입니다.
          </p>

          <Pagination
            page={result.page}
            hrefFor={(next) => hrefWith("/charges", current, { page: next })}
          />
        </>
      )}
    </main>
  );
}
