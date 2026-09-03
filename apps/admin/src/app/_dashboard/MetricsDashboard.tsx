/**
 * 지표 대시보드 본문 (T6.2) — 어드민 홈 `/` 의 콘텐츠.
 *
 * 전부 서버 컴포넌트다(클라이언트 상태 0). 구간 전환은 `?days=` 링크로 하므로 새로고침·공유가
 * 되고, 자바스크립트 없이도 화면이 완성된다.
 *
 * 집계·규칙은 하나도 들고 있지 않다 — web 의 `GET /api/admin/metrics/overview`·`/funnel` 이
 * 계산해서 보낸 값을 그대로 그린다(`shared.ts` 주석 참고).
 */
import { Badge, Card, CardHeader } from "@zari/ui";
import Link from "next/link";
import { css } from "styled-system/css";
import { BarRows, StatTiles, TrendColumns, type BarRow, type TrendPoint } from "./charts";
import { FunnelChart } from "./FunnelChart";
import {
  formatCount,
  formatDayFull,
  formatDayLabel,
  formatKrw,
  formatMoment,
  formatPercent,
  RANGE_PRESETS,
  type FunnelFetchResult,
  type OverviewResult,
} from "./shared";

const headStyle = css({
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "4",
  flexWrap: "wrap",
});
const titleStyle = css({ textStyle: "headline", color: "text" });
const leadStyle = css({ textStyle: "body", color: "text.muted", mt: "1" });
const rangeStyle = css({ display: "flex", gap: "2", flexWrap: "wrap" });
const rangeLinkStyle = css({
  textStyle: "caption",
  color: "text.muted",
  textDecoration: "none",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "border",
  rounded: "pill",
  px: "3",
  py: "1.5",
  _hover: { bg: "bg.subtle" },
});
const rangeActiveStyle = css({
  textStyle: "caption",
  color: "primary.fg",
  bg: "primary",
  borderColor: "primary",
  borderWidth: "hairline",
  borderStyle: "solid",
  textDecoration: "none",
  rounded: "pill",
  px: "3",
  py: "1.5",
});
const sectionStyle = css({ mt: "6" });
const errorStyle = css({ textStyle: "body", color: "danger.text" });
const hintStyle = css({ textStyle: "caption", color: "text.muted", mt: "2" });
const generatedStyle = css({ textStyle: "caption", color: "text.muted", mt: "4" });

function FetchError({ message, status }: { message: string; status: number | null }) {
  return (
    <Card padding="lg">
      <p className={errorStyle}>{message}</p>
      <p className={hintStyle}>
        {status ? `web 응답 ${status}. ` : ""}
        어드민은 로그인이 없어 서버 액션이 x-admin-secret 으로 web 을 부릅니다 — web 과 같은
        ADMIN_API_SECRET(없으면 CRON_SECRET)과 NEXT_PUBLIC_WEB_URL 을 확인하세요.
      </p>
    </Card>
  );
}

export function MetricsDashboard({
  days,
  overview,
  funnel,
}: {
  days: number;
  overview: OverviewResult;
  funnel: FunnelFetchResult;
}) {
  return (
    <>
      <div className={headStyle}>
        <div>
          <h1 className={titleStyle}>지표 대시보드</h1>
          <p className={leadStyle}>
            가입·방문 추이, 수납률, 고지서 열람률, 결제액, 환급 파이프라인과 A/B 퍼널을 한 화면에서
            봅니다. 집계는 web 의 지표 API 두 개(overview·funnel)가 계산합니다.
          </p>
        </div>
        <nav className={rangeStyle} aria-label="집계 구간">
          {RANGE_PRESETS.map((preset) => (
            <Link
              key={preset.days}
              href={`/?days=${preset.days}`}
              className={preset.days === days ? rangeActiveStyle : rangeLinkStyle}
              aria-current={preset.days === days ? "page" : undefined}
            >
              {preset.label}
            </Link>
          ))}
        </nav>
      </div>

      {overview.ok ? (
        <MetricsBody days={days} overview={overview.overview} />
      ) : (
        <div className={sectionStyle}>
          <FetchError message={overview.message} status={overview.status} />
        </div>
      )}

      <section className={sectionStyle}>
        <Card padding="lg">
          <CardHeader
            title="A/B 퍼널 — 공개 고지서 가입 CTA"
            aside={
              funnel.ok ? (
                <Badge tone="brand" size="md">
                  {funnel.funnel.experimentKey}
                </Badge>
              ) : null
            }
          />
          {funnel.ok ? (
            <>
              <p className={hintStyle}>
                {funnel.funnel.description}. 단계 카운트는 방문자(anonId) 중복 제거이고, 각 단계는
                앞 단계를 지난 사람만 셉니다.
              </p>
              <div className={css({ mt: "4" })}>
                <FunnelChart funnel={funnel.funnel} />
              </div>
            </>
          ) : (
            <FetchError message={funnel.message} status={funnel.status} />
          )}
        </Card>
      </section>

      {overview.ok ? (
        <p className={generatedStyle}>집계 시각 {formatMoment(overview.overview.generatedAt)}</p>
      ) : null}
    </>
  );
}

function MetricsBody({
  days,
  overview,
}: {
  days: number;
  overview: Extract<OverviewResult, { ok: true }>["overview"];
}) {
  const { summary, collection, messages, payments, refunds, range } = overview;

  const trend: TrendPoint[] = overview.daily.map((point) => ({
    key: point.date,
    label: formatDayLabel(point.date),
    fullLabel: formatDayFull(point.date),
    values: [
      { key: "signups", label: "신규 가입", value: point.signups, fill: "brand" },
      { key: "dau", label: "순 방문자", value: point.dau, fill: "info" },
    ],
  }));

  const collectionRows: BarRow[] = collection.months.map((month) => ({
    key: month.key,
    label: month.label,
    segments: [
      { key: "collected", label: "수납", value: month.collectedAmount, fill: "success" },
      { key: "outstanding", label: "미납", value: month.outstandingAmount, fill: "danger" },
    ],
    valueText: formatPercent(month.rate),
    note: `${formatKrw(month.collectedAmount)} / ${formatKrw(month.chargedAmount)}`,
  }));

  const messageRows: BarRow[] = messages.months.map((month) => ({
    key: month.key,
    label: month.label,
    segments: [
      { key: "opened", label: "열람", value: month.opened, fill: "brand" },
      { key: "unopened", label: "미열람", value: month.trackable - month.opened, fill: "neutral" },
    ],
    valueText: formatPercent(month.openRate),
    note: `발송 ${formatCount(month.sent)} · 링크 ${formatCount(month.trackable)} 중 ${formatCount(month.opened)} 열람`,
  }));

  const paymentRows: BarRow[] = payments.months.map((month) => ({
    key: month.key,
    label: month.label,
    segments: [{ key: "amount", label: "결제액", value: month.amount, fill: "info" }],
    valueText: formatKrw(month.amount),
    note: formatCount(month.count),
  }));

  const refundRows: BarRow[] = refunds.stages.map((stage) => ({
    key: stage.status,
    label: stage.label,
    segments: [{ key: "count", label: "신청", value: stage.count, fill: "warning" }],
    valueText: formatCount(stage.count),
    note: stage.expectedAmount > 0 ? `예상 ${formatKrw(stage.expectedAmount)}` : undefined,
  }));

  return (
    <>
      <div className={sectionStyle}>
        <StatTiles
          tiles={[
            {
              key: "users",
              label: "총 가입자",
              value: formatCount(summary.users, "명"),
              note: `최근 ${days}일 신규 ${formatCount(summary.newUsers, "명")}`,
            },
            {
              key: "visitors",
              label: `순 방문자 (${days}일)`,
              value: formatCount(summary.visitors, "명"),
              note: "TrackingEvent anonId 중복 제거",
            },
            {
              key: "collection",
              label: `수납률 (${range.months}개월)`,
              value: formatPercent(summary.collectionRate),
              note: `미납 ${formatKrw(summary.outstandingAmount)}`,
            },
            {
              key: "open-rate",
              label: "고지서 열람률",
              value: formatPercent(summary.openRate),
              note: `계약중 ${formatCount(summary.activeLeases)}`,
            },
            {
              key: "payments",
              label: `자리페이 결제액 (${range.months}개월)`,
              value: formatKrw(summary.paymentAmount),
              note: formatCount(payments.total.count),
            },
            {
              key: "refunds",
              label: "환급 처리 대기",
              value: formatCount(summary.refundOpenCount),
              note: `전체 ${formatCount(refunds.total.count)}`,
            },
            {
              key: "charged",
              label: `청구액 (${range.months}개월)`,
              value: formatKrw(collection.total.chargedAmount),
              note: `${formatCount(collection.total.settledCount)} 완납 / ${formatCount(collection.total.chargeCount)}`,
            },
            {
              key: "notices",
              label: `발송 (${range.months}개월)`,
              value: formatCount(messages.total.sent),
              note: `공개 링크 ${formatCount(messages.total.trackable)}`,
            },
          ]}
        />
      </div>

      <section className={sectionStyle}>
        <Card padding="lg">
          <CardHeader
            title={`가입·방문 추이 (최근 ${days}일)`}
            aside={<Badge tone="neutral">{`${range.from} ~ ${range.to}`}</Badge>}
          />
          <TrendColumns
            points={trend}
            legend={[
              { label: "신규 가입", fill: "brand" },
              { label: "순 방문자(DAU)", fill: "info" },
            ]}
            emptyText="이 구간에는 가입도 방문도 없습니다."
            testId="trend-chart"
          />
        </Card>
      </section>

      <section className={sectionStyle}>
        <Card padding="lg">
          <CardHeader
            title="월별 수납률 (청구 대비 납부)"
            aside={<Badge tone="info">{formatPercent(collection.total.rate)}</Badge>}
          />
          <BarRows
            rows={collectionRows}
            legend={[
              { label: "수납", fill: "success" },
              { label: "미납", fill: "danger" },
            ]}
            emptyText="이 구간에는 청구가 없습니다."
            testId="collection-chart"
          />
        </Card>
      </section>

      <section className={sectionStyle}>
        <Card padding="lg">
          <CardHeader
            title="고지서 발송·열람률"
            aside={<Badge tone="info">{formatPercent(messages.total.openRate)}</Badge>}
          />
          <BarRows
            rows={messageRows}
            legend={[
              { label: "열람", fill: "brand" },
              { label: "미열람", fill: "neutral" },
            ]}
            emptyText="이 구간에는 발송이 없습니다."
            testId="message-chart"
          />
          <p className={hintStyle}>
            열람률의 분모는 공개 고지서 링크(token)가 붙은 발송입니다 — OTP 처럼 열람을 판정할 수
            없는 발송은 분모에서 뺍니다.
          </p>
        </Card>
      </section>

      <section className={sectionStyle}>
        <Card padding="lg">
          <CardHeader
            title="자리페이 결제액 추이"
            aside={<Badge tone="info">{formatKrw(payments.total.amount)}</Badge>}
          />
          <BarRows
            rows={paymentRows}
            emptyText="이 구간에는 승인된 결제가 없습니다."
            testId="payment-chart"
          />
          <p className={hintStyle}>토스 승인(DONE) 건만 셉니다.</p>
        </Card>
      </section>

      <section className={sectionStyle}>
        <Card padding="lg">
          <CardHeader
            title="환급 파이프라인"
            aside={<Badge tone="warning">{formatCount(refunds.total.count)}</Badge>}
          />
          <BarRows
            rows={refundRows}
            emptyText="아직 환급 신청이 없습니다."
            testId="refund-chart"
          />
        </Card>
      </section>
    </>
  );
}
