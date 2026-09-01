"use client";

/**
 * 고지서 발송 시트 (T1.7) — **재사용 컴포넌트**.
 *
 * 종류 선택(월세·연체·만기) → 대상 청구 선택 → 알림톡 말풍선 미리보기 → 발송.
 *
 * ## 다른 화면에 꽂는 법 (T1.2 계약 상세 · T1.5 청구 시트)
 *
 * ```tsx
 * const [open, setOpen] = useState(false);
 *
 * <Button onClick={() => setOpen(true)}>고지서 보내기</Button>
 * <NoticeSendSheet
 *   open={open}
 *   onClose={() => setOpen(false)}
 *   leaseId={lease.id}
 *   defaultKind="OVERDUE_NOTICE"     // 선택 — 청구 시트에서 연체 청구를 눌렀다면
 *   defaultChargeId={charge.id}      // 선택 — 특정 청구를 미리 고른 채로 열기
 *   onSent={({ noticeUrl }) => toast(noticeUrl)}
 * />
 * ```
 *
 * **필요한 건 `leaseId` 하나뿐이다.** 세입자·건물·청구 목록은 시트가 스스로
 * `GET /api/leases/[id]/notices` 로 읽는다(이미 들고 있다면 `initialTarget` 으로 넘겨 재조회를 아낀다).
 *
 * 금액 문구는 원장 엔진(`@/lib/rent`)이 계산한 값을 템플릿이 옮긴 것이다 — 시트는 계산하지 않는다.
 */
import { Badge, Button, Sheet, Spinner } from "@zari/ui";
import { useEffect, useMemo, useState } from "react";
import { css, cx } from "styled-system/css";
import { ApiError } from "@/features/auth/api";
import { formatPhone } from "@/lib/phone";
import { kstToday } from "@/lib/rent";
import { CHARGE_STATUS_META, NOTICE_KIND_OPTIONS, noticeKindRequiresCharge, demoBankAccount, type NoticeKind } from "./constants";
import { useNoticeTarget, useSendNotice } from "./hooks";
import { NoticePreview } from "./NoticePreview";
import { formatWon, renderNoticeTemplate, isOverdueLike, type NoticeTemplateCharge } from "./template";
import type { MessageLogDto, NoticeChargeDto, NoticeTargetDto } from "./types";

export type NoticeSendResult = { message: MessageLogDto; noticeUrl: string };

export type NoticeSendSheetProps = {
  /** 시트 열림 여부 */
  open: boolean;
  /** 닫기(딤·ESC·닫기 버튼·발송 완료 후 닫기에서 모두 호출된다) */
  onClose: () => void;
  /** 고지서를 보낼 계약. null 이면 아무것도 그리지 않는다 */
  leaseId: string | null;
  /** 처음 선택돼 있을 종류. 기본 `RENT_NOTICE` */
  defaultKind?: NoticeKind;
  /** 처음 선택돼 있을 청구. 없으면 미납이 남은 최신 청구를 고른다 */
  defaultChargeId?: string;
  /** 호출부가 이미 계약 정보를 들고 있다면 넘긴다(재조회 생략) */
  initialTarget?: NoticeTargetDto;
  /** 발송 성공 시 — 발송 이력 갱신은 훅이 알아서 한다(쿼리 무효화) */
  onSent?: (result: NoticeSendResult) => void;
};

const sectionStyle = css({ display: "flex", flexDirection: "column", gap: "2", mb: "4" });
const sectionTitleStyle = css({ textStyle: "label", color: "text.muted" });
const kindRowStyle = css({ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "2" });
const kindButtonStyle = css({
  py: "2.5",
  px: "2",
  rounded: "field",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "border",
  bg: "bg.card",
  textStyle: "bodyStrong",
  color: "text",
  cursor: "pointer",
  minH: "tap",
});
const kindSelectedStyle = css({
  bg: "primary.subtle",
  borderColor: "primary.border",
  borderWidth: "thick",
});
const kindDescStyle = css({ textStyle: "caption", color: "text.muted" });
const chargeListStyle = css({ display: "flex", flexDirection: "column", gap: "2" });
const chargeButtonStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
  w: "full",
  py: "2.5",
  px: "3",
  rounded: "field",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "border",
  bg: "bg.card",
  textAlign: "left",
  cursor: "pointer",
  minH: "tap",
});
const chargeSelectedStyle = css({
  bg: "primary.subtle",
  borderColor: "primary.border",
  borderWidth: "thick",
});
const chargeMonthStyle = css({ textStyle: "bodyStrong", color: "text" });
const chargeAmountStyle = css({ textStyle: "caption", color: "text.muted", fontFamily: "numeric" });
const memoStyle = css({
  w: "full",
  minH: "72px",
  p: "3",
  rounded: "field",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "border",
  bg: "bg.card",
  textStyle: "body",
  color: "text",
  resize: "vertical",
  _focusVisible: { outline: "2px solid", outlineColor: "border.focus", outlineOffset: "1px" },
});
const recipientStyle = css({ textStyle: "caption", color: "text.muted" });
const errorStyle = css({
  bg: "danger.subtle",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "danger.border",
  rounded: "field",
  p: "3",
  textStyle: "caption",
  color: "danger.text",
});
const emptyStyle = css({ textStyle: "caption", color: "text.muted" });
const sentBoxStyle = css({
  bg: "success.subtle",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "success.border",
  rounded: "card",
  p: "gutter",
  display: "flex",
  flexDirection: "column",
  gap: "2",
});
const sentTitleStyle = css({ textStyle: "bodyStrong", color: "success.text" });
const sentLinkStyle = css({
  textStyle: "caption",
  color: "text.brand",
  textDecoration: "underline",
  wordBreak: "break-all",
});
const centerStyle = css({ display: "flex", justifyContent: "center", py: "6" });

/** `YYYY-MM-DD` → UTC 자정 Date (`@db.Date` 규칙) */
const toUtcDate = (value: string): Date => new Date(`${value}T00:00:00Z`);

function toTemplateCharge(charge: NoticeChargeDto): NoticeTemplateCharge {
  return {
    year: charge.year,
    month: charge.month,
    dueDate: toUtcDate(charge.dueDate),
    rentAmount: charge.rentAmount,
    maintenanceAmount: charge.maintenanceAmount,
    carriedOverAmount: charge.carriedOverAmount,
    lateFeeAmount: charge.lateFeeAmount,
    totalDue: charge.totalDue,
    paidAmount: charge.paidAmount,
  };
}

/** 기본 선택 청구 — 연체 안내면 연체 중인 것, 아니면 미납이 남은 최신 청구. */
function pickDefaultCharge(
  charges: NoticeChargeDto[],
  kind: NoticeKind,
  asOf: Date,
): string | null {
  if (charges.length === 0) return null;
  if (kind === "OVERDUE_NOTICE") {
    const overdue = charges.find((charge) => isOverdueLike(toTemplateCharge(charge), asOf));
    if (overdue) return overdue.id;
  }
  const unpaid = charges.find((charge) => charge.outstanding > 0);
  return (unpaid ?? charges[0])?.id ?? null;
}

function errorMessage(error: unknown): string | undefined {
  if (error instanceof ApiError) return error.message;
  return error ? "잠시 후 다시 시도해 주세요." : undefined;
}

export function NoticeSendSheet({
  open,
  onClose,
  leaseId,
  defaultKind = "RENT_NOTICE",
  defaultChargeId,
  initialTarget,
  onSent,
}: NoticeSendSheetProps) {
  const [kind, setKind] = useState<NoticeKind>(defaultKind);
  const [chargeId, setChargeId] = useState<string | null>(defaultChargeId ?? null);
  const [memo, setMemo] = useState("");
  const [sent, setSent] = useState<NoticeSendResult | null>(null);

  const { data: target, isLoading } = useNoticeTarget(open ? leaseId : null, initialTarget);
  const sendNotice = useSendNotice(leaseId ?? "");

  // 시트를 새로 열 때마다 선택을 초기화한다(이전 계약의 선택이 남지 않게)
  useEffect(() => {
    if (!open) return;
    setKind(defaultKind);
    setChargeId(defaultChargeId ?? null);
    setMemo("");
    setSent(null);
    sendNotice.reset();
    // 의도적으로 open·leaseId 변화에만 반응한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, leaseId, defaultKind, defaultChargeId]);

  const asOf = useMemo(() => kstToday(), []);
  const charges = target?.charges ?? [];
  const needsCharge = noticeKindRequiresCharge(kind);
  const selectedChargeId =
    chargeId && charges.some((charge) => charge.id === chargeId)
      ? chargeId
      : pickDefaultCharge(charges, kind, asOf);
  const selectedCharge = charges.find((charge) => charge.id === selectedChargeId) ?? null;

  const preview = useMemo(() => {
    if (!target) return null;
    if (needsCharge && !selectedCharge) return null;
    return renderNoticeTemplate({
      kind,
      landlordName: target.landlordName,
      tenantName: target.tenantName,
      buildingName: target.buildingName,
      unitLabel: target.unitLabel,
      lease: {
        monthlyRent: target.monthlyRent,
        maintenanceFee: target.maintenanceFee,
        paymentDay: target.paymentDay,
        startDate: toUtcDate(target.startDate),
        endDate: toUtcDate(target.endDate),
      },
      charge: needsCharge && selectedCharge ? toTemplateCharge(selectedCharge) : null,
      asOf,
      bankAccount: demoBankAccount(target.landlordName),
      memo,
    });
  }, [target, kind, needsCharge, selectedCharge, asOf, memo]);

  if (!leaseId) return null;

  async function handleSend() {
    if (!leaseId) return;
    try {
      const result = await sendNotice.mutateAsync({
        kind,
        ...(needsCharge && selectedChargeId ? { chargeId: selectedChargeId } : {}),
        ...(memo.trim() ? { memo: memo.trim() } : {}),
      });
      setSent(result);
      onSent?.(result);
    } catch {
      /* 실패 문구는 아래 errorStyle 로 표시된다 */
    }
  }

  const canSend = Boolean(preview) && (!needsCharge || Boolean(selectedChargeId));

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={sent ? "고지서를 보냈습니다" : "고지서 보내기"}
      description={
        target ? `${target.buildingName} ${target.unitLabel} · ${target.tenantName}님` : undefined
      }
      footer={
        sent ? (
          <Button fullWidth onClick={onClose} data-testid="notice-sent-close">
            닫기
          </Button>
        ) : (
          <Button
            fullWidth
            size="lg"
            onClick={handleSend}
            disabled={!canSend || sendNotice.isPending}
            loading={sendNotice.isPending}
            data-testid="notice-send-submit"
          >
            발송하기
          </Button>
        )
      }
    >
      {isLoading && !target ? (
        <div className={centerStyle}>
          <Spinner />
        </div>
      ) : null}

      {target && sent ? (
        <div className={sentBoxStyle} data-testid="notice-sent">
          <p className={sentTitleStyle}>
            {formatPhone(target.tenantPhone)} 로 발송 처리했습니다.
          </p>
          <p className={css({ textStyle: "caption", color: "text" })}>
            실제 알림톡은 나가지 않습니다. 아래 링크가 세입자에게 전달되는 공개 고지서입니다.
          </p>
          <a
            className={sentLinkStyle}
            href={sent.message.noticePath ?? sent.noticeUrl}
            target="_blank"
            rel="noreferrer"
            data-testid="notice-sent-link"
          >
            {sent.noticeUrl}
          </a>
        </div>
      ) : null}

      {target && !sent ? (
        <>
          <div className={sectionStyle}>
            <p className={sectionTitleStyle}>받는 사람</p>
            <p className={recipientStyle}>
              {target.tenantName} · {formatPhone(target.tenantPhone)}
              {target.tenantProfileId ? "" : " (미가입 — 공개 고지서 링크로 열람)"}
            </p>
          </div>

          <div className={sectionStyle}>
            <p className={sectionTitleStyle}>종류</p>
            <div className={kindRowStyle}>
              {NOTICE_KIND_OPTIONS.map((option) => (
                <button
                  key={option.kind}
                  type="button"
                  className={cx(kindButtonStyle, kind === option.kind && kindSelectedStyle)}
                  aria-pressed={kind === option.kind}
                  onClick={() => setKind(option.kind)}
                  data-testid={`notice-kind-${option.kind}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className={kindDescStyle}>
              {NOTICE_KIND_OPTIONS.find((option) => option.kind === kind)?.description}
            </p>
          </div>

          {needsCharge ? (
            <div className={sectionStyle}>
              <p className={sectionTitleStyle}>대상 청구</p>
              {charges.length === 0 ? (
                <p className={emptyStyle}>
                  아직 청구가 없습니다. 청구가 생성되면 월세·연체 고지서를 보낼 수 있습니다.
                </p>
              ) : (
                <div className={chargeListStyle}>
                  {charges.map((charge) => {
                    const meta = CHARGE_STATUS_META[charge.status];
                    return (
                      <button
                        key={charge.id}
                        type="button"
                        className={cx(
                          chargeButtonStyle,
                          selectedChargeId === charge.id && chargeSelectedStyle,
                        )}
                        aria-pressed={selectedChargeId === charge.id}
                        onClick={() => setChargeId(charge.id)}
                        data-testid={`notice-charge-${charge.id}`}
                      >
                        <span>
                          <span className={chargeMonthStyle}>
                            {charge.year}년 {charge.month}월
                          </span>
                          <span className={chargeAmountStyle}>
                            {" "}
                            {formatWon(charge.totalDue)}
                            {charge.outstanding > 0 && charge.outstanding !== charge.totalDue
                              ? ` (미납 ${formatWon(charge.outstanding)})`
                              : ""}
                          </span>
                        </span>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}

          <div className={sectionStyle}>
            <p className={sectionTitleStyle}>임대인 메시지 (선택)</p>
            <textarea
              className={memoStyle}
              value={memo}
              maxLength={200}
              placeholder="예) 이번 달부터 관리비가 조정되었습니다."
              onChange={(event) => setMemo(event.target.value)}
              data-testid="notice-memo"
            />
          </div>

          <div className={sectionStyle}>
            <p className={sectionTitleStyle}>미리보기</p>
            {preview ? (
              <NoticePreview title={preview.title} body={preview.body} />
            ) : (
              <p className={emptyStyle}>대상 청구를 선택하면 미리보기가 만들어집니다.</p>
            )}
          </div>

          {sendNotice.error ? (
            <p className={errorStyle} role="alert">
              {errorMessage(sendNotice.error)}
            </p>
          ) : null}
        </>
      ) : null}
    </Sheet>
  );
}
