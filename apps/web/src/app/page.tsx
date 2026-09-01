"use client";

import { Badge, Button, Card, Input, Sheet } from "@zari/ui";
import type { BadgeTone } from "@zari/ui";
import { useState } from "react";
import { css } from "styled-system/css";

/**
 * Phase 0 스캐폴딩 홈. T0.4(로그인)·T0.5(셸)가 들어오면 대체된다.
 * 지금은 T0.6 디자인 토큰·공용 컴포넌트가 실제로 붙는지 보여 주는 역할이다.
 * 색은 전부 semantic 토큰만 쓴다 — 하드코딩 색상 0.
 */

type Role = {
  key: string;
  label: string;
  desc: string;
  tone: BadgeTone;
  status: string;
};

const roles: Role[] = [
  {
    key: "landlord",
    label: "임대인",
    desc: "수납관리 · 고지서 · 임대장부",
    tone: "success",
    status: "완납 3건",
  },
  {
    key: "tenant",
    label: "세입자",
    desc: "월세 카드결제 · 환급 · 매물 탐색",
    tone: "warning",
    status: "부분납 1건",
  },
  {
    key: "realtor",
    label: "중개인",
    desc: "공실 중개 요청 수신",
    tone: "info",
    status: "신규 요청",
  },
  {
    key: "master",
    label: "마스터",
    desc: "청소 · 인테리어 · 수리 견적",
    tone: "neutral",
    status: "준비 중",
  },
];

const pageStyle = css({
  px: "gutter",
  pb: "section",
  display: "flex",
  flexDirection: "column",
  gap: "section",
});
const headerStyle = css({ pt: "10", display: "flex", flexDirection: "column", gap: "2" });
const brandStyle = css({ textStyle: "display", color: "text" });
const brandAccentStyle = css({ color: "text.brand" });
const leadStyle = css({ textStyle: "body", color: "text.muted" });
const listStyle = css({ display: "flex", flexDirection: "column", gap: "3" });
const cardTopStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
});
const roleLabelStyle = css({ textStyle: "subtitle", color: "text" });
const roleDescStyle = css({ textStyle: "caption", color: "text.muted", mt: "1" });
const noticeStyle = css({
  bg: "primary.subtle",
  border: "1px solid",
  borderColor: "primary.border",
  rounded: "card",
  p: "gutter",
  textStyle: "caption",
  color: "text",
});
const sheetFieldsStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "field",
});

export default function HomePage() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [phone, setPhone] = useState("");

  // 데모용 최소 검증 — 실제 인증은 T0.3/T0.4가 담당한다
  const phoneError =
    phone.length > 0 && !/^01[0-9]{8,9}$/.test(phone)
      ? "숫자만, 010으로 시작하는 10~11자리로 입력해 주세요"
      : undefined;

  return (
    <main className={pageStyle}>
      <header className={headerStyle}>
        <h1 className={brandStyle}>
          자리 <span className={brandAccentStyle}>데모</span>
        </h1>
        <p className={leadStyle}>
          임대인·세입자·중개인·마스터를 잇는 임대관리 데모 (스캐폴딩 단계)
        </p>
        <div>
          <Badge tone="brand" size="md" solid>
            Phase 0
          </Badge>
        </div>
      </header>

      <section className={listStyle}>
        {roles.map((role) => (
          <Card key={role.key}>
            <div className={cardTopStyle}>
              <h2 className={roleLabelStyle}>{role.label}</h2>
              <Badge tone={role.tone}>{role.status}</Badge>
            </div>
            <p className={roleDescStyle}>{role.desc}</p>
          </Card>
        ))}
      </section>

      <p className={noticeStyle}>
        브랜드 옐로는 면(버튼·배지)에만 쓰고, 글자는 잉크색이나 어두운 옐로를 쓴다 —
        흰 배경에서 대비 4.5:1 이상을 지키기 위한 규칙이다.
      </p>

      <Button fullWidth size="lg" onClick={() => setSheetOpen(true)}>
        데모 로그인
      </Button>

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="데모 로그인"
        description="전화번호를 넣으면 모의 OTP가 화면에 노출됩니다 (T0.4에서 연결)"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSheetOpen(false)}>
              취소
            </Button>
            <Button fullWidth disabled={!phone || Boolean(phoneError)}>
              인증번호 받기
            </Button>
          </>
        }
      >
        <div className={sheetFieldsStyle}>
          <Input
            label="전화번호"
            required
            inputMode="numeric"
            placeholder="01012345678"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            error={phoneError}
            helper="가입 시 이 번호로 기존 계약을 찾습니다"
          />
        </div>
      </Sheet>
    </main>
  );
}
