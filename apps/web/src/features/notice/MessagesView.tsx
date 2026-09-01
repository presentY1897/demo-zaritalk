"use client";

/**
 * `/landlord/messages` 화면 본체 (T1.7) — 고지서 보내기 + 발송 이력.
 *
 * 첫 데이터는 서버 컴포넌트(page.tsx)가 넘겨주고, 발송 후에는 Tanstack Query 무효화로 다시 읽는다
 * (`GET /api/landlord/messages` 와 **같은 함수** `listLandlordMessages` 를 서버가 쓴다).
 *
 * 발송 시트(`NoticeSendSheet`)는 재사용 컴포넌트다 — 여기서는 계약 카드의 「보내기」로 연다.
 * T1.2(계약 상세)·T1.5(청구 시트)도 같은 컴포넌트를 `leaseId` 만 넘겨 꽂는다.
 */
import { Badge, Button, Card } from "@zari/ui";
import { useState } from "react";
import { css } from "styled-system/css";
import { formatPhone } from "@/lib/phone";
import { CHARGE_STATUS_META, messageKindLabel } from "./constants";
import { formatKstDateTime } from "./format";
import { useLandlordMessages } from "./hooks";
import { NoticeSendSheet } from "./NoticeSendSheet";
import type { MessageLogDto, NoticeTargetDto } from "./types";

const pageStyle = css({
  px: "gutter",
  py: "section",
  display: "flex",
  flexDirection: "column",
  gap: "gutter",
});
const titleStyle = css({ textStyle: "headline", color: "text" });
const leadStyle = css({ textStyle: "caption", color: "text.muted", mt: "1" });
const sectionTitleStyle = css({ textStyle: "subtitle", color: "text" });
const listStyle = css({ display: "flex", flexDirection: "column", gap: "3" });
const targetRowStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "3",
});
const targetNameStyle = css({ textStyle: "bodyStrong", color: "text" });
const targetSubStyle = css({ textStyle: "caption", color: "text.muted", mt: "0.5" });
const badgeRowStyle = css({ display: "flex", flexWrap: "wrap", gap: "1.5", mt: "2" });
const messageHeadStyle = css({
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "2",
});
const messageTitleStyle = css({ textStyle: "bodyStrong", color: "text" });
const messageMetaStyle = css({ textStyle: "caption", color: "text.muted", mt: "1" });
const messageFootStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
  mt: "3",
});
const linkStyle = css({ textStyle: "caption", color: "text.brand", textDecoration: "underline" });
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
const noteStyle = css({
  bg: "info.subtle",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "info.border",
  rounded: "field",
  p: "3",
  textStyle: "caption",
  color: "info.text",
});

export type MessagesViewProps = {
  initialMessages: MessageLogDto[];
  /** 고지서를 보낼 수 있는 진행 중 계약 */
  targets: NoticeTargetDto[];
};

export function MessagesView({ initialMessages, targets }: MessagesViewProps) {
  const { data: messages = initialMessages } = useLandlordMessages(initialMessages);
  const [openLeaseId, setOpenLeaseId] = useState<string | null>(null);

  const openedCount = messages.filter((message) => message.openedAt).length;

  return (
    <main className={pageStyle}>
      <header>
        <h1 className={titleStyle}>고지서</h1>
        <p className={leadStyle}>
          발송 {messages.length}건 · 열람 {openedCount}건
        </p>
      </header>

      <p className={noteStyle}>
        데모라 <strong>실제 알림톡·SMS 는 발송되지 않습니다.</strong> 발송하면 이력이 쌓이고,
        세입자는 공개 고지서 링크로 로그인 없이 내역을 볼 수 있습니다.
      </p>

      <section className={listStyle} aria-labelledby="notice-targets">
        <h2 className={sectionTitleStyle} id="notice-targets">
          고지서 보내기
        </h2>
        {targets.length === 0 ? (
          <p className={emptyStyle}>진행 중인 계약이 없습니다.</p>
        ) : (
          targets.map((target) => {
            const latest = target.charges[0];
            const meta = latest ? CHARGE_STATUS_META[latest.status] : null;
            return (
              <Card key={target.leaseId} padding="md">
                <div className={targetRowStyle}>
                  <div>
                    <p className={targetNameStyle}>
                      {target.buildingName} {target.unitLabel}
                    </p>
                    <p className={targetSubStyle}>
                      {target.tenantName} · {formatPhone(target.tenantPhone)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setOpenLeaseId(target.leaseId)}
                    data-testid={`notice-send-open-${target.unitLabel}`}
                  >
                    보내기
                  </Button>
                </div>
                <div className={badgeRowStyle}>
                  {target.tenantProfileId ? null : <Badge tone="warning">미가입 세입자</Badge>}
                  {latest && meta ? (
                    <Badge tone={meta.tone}>
                      {latest.year}년 {latest.month}월 {meta.label}
                    </Badge>
                  ) : (
                    <Badge tone="neutral">청구 없음</Badge>
                  )}
                </div>
              </Card>
            );
          })
        )}
      </section>

      <section className={listStyle} aria-labelledby="notice-history">
        <h2 className={sectionTitleStyle} id="notice-history">
          발송 이력
        </h2>
        {messages.length === 0 ? (
          <p className={emptyStyle}>아직 보낸 고지서가 없습니다.</p>
        ) : (
          messages.map((message) => (
            <Card key={message.id} padding="md" data-testid="message-row">
              <div className={messageHeadStyle}>
                <div>
                  <p className={messageTitleStyle}>{message.title}</p>
                  <p className={messageMetaStyle}>
                    {message.buildingName} {message.unitLabel} · {message.tenantName} ·{" "}
                    {formatPhone(message.toPhone)}
                  </p>
                  <p className={messageMetaStyle}>{formatKstDateTime(message.sentAt)} 발송</p>
                </div>
                <Badge tone="info">{messageKindLabel(message.kind)}</Badge>
              </div>

              <div className={messageFootStyle}>
                {message.openedAt ? (
                  <Badge tone="success" data-testid="message-opened">
                    열람 {formatKstDateTime(message.openedAt)}
                  </Badge>
                ) : (
                  <Badge tone="neutral" data-testid="message-unopened">
                    미열람
                  </Badge>
                )}
                {message.noticePath ? (
                  <a
                    className={linkStyle}
                    href={message.noticePath}
                    target="_blank"
                    rel="noreferrer"
                    data-testid="message-notice-link"
                  >
                    공개 고지서 열기
                  </a>
                ) : null}
              </div>
            </Card>
          ))
        )}
      </section>

      <NoticeSendSheet
        open={openLeaseId !== null}
        onClose={() => setOpenLeaseId(null)}
        leaseId={openLeaseId}
        initialTarget={targets.find((target) => target.leaseId === openLeaseId)}
      />
    </main>
  );
}
