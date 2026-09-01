"use client";

/**
 * 로그인 화면 (T0.4) — 전화번호 → 모의 OTP → 로그인.
 *
 * 데모라 인증번호를 화면에 그대로 노출한다(T0.3 `POST /api/auth/otp/request` 응답의 `code`).
 * 하단에는 역할별 원클릭 데모 로그인 4종을 둔다 — 시연에서 계정 전환이 즉시 되도록.
 *
 * 로그인 뒤 이동: 기존 회원 → `/`(홈), 신규 번호 → `/onboarding?ticket=…`.
 */
import { Button, cardRecipe, Input } from "@zari/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { css, cx } from "styled-system/css";
import { formatPhone } from "@/lib/phone";
import { ApiError } from "./api";
import { useDemoLogin, useRequestOtp, useVerifyOtp } from "./hooks";
import type { DemoAccountOption, DemoRoleValue } from "./types";

const pageStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "section",
  py: "8",
});
const headerStyle = css({ display: "flex", flexDirection: "column", gap: "1.5" });
const brandStyle = css({ textStyle: "display", color: "text" });
const brandAccentStyle = css({ color: "text.brand" });
const leadStyle = css({ textStyle: "body", color: "text.muted" });
const formStyle = css({ display: "flex", flexDirection: "column", gap: "field" });
const codeBoxStyle = css({
  bg: "primary.subtle",
  border: "1px solid",
  borderColor: "primary.border",
  rounded: "card",
  p: "gutter",
  display: "flex",
  flexDirection: "column",
  gap: "1",
});
const codeLabelStyle = css({ textStyle: "caption", color: "text" });
const codeValueStyle = css({
  fontFamily: "numeric",
  textStyle: "headline",
  color: "text",
  letterSpacing: "0.18em",
});
const errorBoxStyle = css({
  bg: "danger.subtle",
  border: "1px solid",
  borderColor: "danger.border",
  rounded: "field",
  p: "3",
  textStyle: "caption",
  color: "danger.text",
});
const dividerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "3",
  color: "text.muted",
  textStyle: "caption",
  _before: { content: '""', flex: "1", h: "hairline", bg: "border" },
  _after: { content: '""', flex: "1", h: "hairline", bg: "border" },
});
const demoListStyle = css({ display: "flex", flexDirection: "column", gap: "2" });
const demoRowStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "3",
  w: "full",
  textAlign: "left",
});
const demoLabelStyle = css({ textStyle: "bodyStrong", color: "text", display: "block" });
const demoDescStyle = css({
  textStyle: "caption",
  color: "text.muted",
  display: "block",
  mt: "0.5",
});
const demoNameStyle = css({ textStyle: "caption", color: "text.brand", whiteSpace: "nowrap" });
const stepNoteStyle = css({ textStyle: "caption", color: "text.muted" });

function errorMessage(error: unknown): string | undefined {
  if (!error) return undefined;
  if (error instanceof ApiError) return error.message;
  return "잠시 후 다시 시도해 주세요.";
}

export function LoginView({ demoAccounts }: { demoAccounts: DemoAccountOption[] }) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [issued, setIssued] = useState<{ phone: string; code: string } | null>(null);

  const requestOtp = useRequestOtp();
  const verifyOtp = useVerifyOtp();
  const demoLogin = useDemoLogin();

  const phoneDigits = phone.replace(/\D/g, "");
  const phoneReady = /^01[016789]\d{7,8}$/.test(phoneDigits);
  const codeReady = /^\d{6}$/.test(code.trim());

  function goHome() {
    router.replace("/");
    router.refresh();
  }

  // 실패는 mutation.error 로 화면에 뜨므로 여기서는 삼킨다(핸들러에서 reject 하지 않게)
  async function handleRequestOtp() {
    try {
      const result = await requestOtp.mutateAsync(phoneDigits);
      setIssued({ phone: result.phone, code: result.code });
      setCode("");
    } catch {
      /* 화면에 에러 문구로 표시된다 */
    }
  }

  async function handleVerify() {
    try {
      const result = await verifyOtp.mutateAsync({ phone: phoneDigits, code: code.trim() });
      if (result.status === "SESSION") {
        goHome();
        return;
      }
      // 신규 번호 — 가입 티켓을 들고 온보딩으로
      router.replace(`/onboarding?ticket=${encodeURIComponent(result.signupTicket)}`);
    } catch {
      /* 화면에 에러 문구로 표시된다 */
    }
  }

  async function handleDemoLogin(role: DemoRoleValue) {
    try {
      await demoLogin.mutateAsync(role);
      goHome();
    } catch {
      /* 화면에 에러 문구로 표시된다 */
    }
  }

  const busy = requestOtp.isPending || verifyOtp.isPending || demoLogin.isPending;
  const message =
    errorMessage(requestOtp.error) ?? errorMessage(verifyOtp.error) ?? errorMessage(demoLogin.error);

  return (
    <div className={pageStyle}>
      <header className={headerStyle}>
        <h1 className={brandStyle}>
          자리 <span className={brandAccentStyle}>데모</span>
        </h1>
        <p className={leadStyle}>전화번호로 로그인하고 임대인·세입자·중개인·마스터를 오가 보세요.</p>
      </header>

      <section className={formStyle} aria-labelledby="login-heading">
        <h2 className={css({ textStyle: "subtitle", color: "text" })} id="login-heading">
          전화번호 로그인
        </h2>

        <Input
          label="전화번호"
          required
          inputMode="numeric"
          autoComplete="tel"
          placeholder="01012345678"
          value={phone}
          disabled={Boolean(issued)}
          onChange={(event) => setPhone(event.target.value)}
          helper="가입 시 이 번호로 등록된 계약을 찾습니다"
          data-testid="login-phone"
        />

        {issued ? (
          <>
            {/* 데모 전용 — 실서비스라면 절대 코드를 노출하지 않는다 */}
            <div className={codeBoxStyle}>
              <span className={codeLabelStyle}>
                {formatPhone(issued.phone)} 로 보낸 인증번호 (데모라 화면에 그대로 보여 줍니다)
              </span>
              <strong className={codeValueStyle} data-testid="otp-code">
                {issued.code}
              </strong>
            </div>

            <Input
              label="인증번호"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="6자리"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              data-testid="login-code"
            />

            <Button
              fullWidth
              size="lg"
              onClick={handleVerify}
              disabled={!codeReady || busy}
              loading={verifyOtp.isPending}
              data-testid="login-submit"
            >
              로그인
            </Button>

            {/* Button 은 flexShrink:0 이라 fullWidth 둘을 flex 로 나란히 두면 넘친다 — grid 로 반씩 */}
            <div className={css({ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2" })}>
              <Button
                variant="ghost"
                fullWidth
                onClick={() => {
                  setIssued(null);
                  setCode("");
                  requestOtp.reset();
                  verifyOtp.reset();
                }}
              >
                번호 다시 입력
              </Button>
              <Button
                variant="secondary"
                fullWidth
                onClick={handleRequestOtp}
                loading={requestOtp.isPending}
                disabled={busy}
              >
                인증번호 다시 받기
              </Button>
            </div>
            <p className={stepNoteStyle}>인증번호는 5분간 유효합니다.</p>
          </>
        ) : (
          <Button
            fullWidth
            size="lg"
            onClick={handleRequestOtp}
            disabled={!phoneReady || busy}
            loading={requestOtp.isPending}
            data-testid="login-request-otp"
          >
            인증번호 받기
          </Button>
        )}

        {message ? (
          <p className={errorBoxStyle} role="alert">
            {message}
          </p>
        ) : null}
      </section>

      <div className={dividerStyle}>또는</div>

      <section className={demoListStyle} aria-labelledby="demo-login-heading">
        <h2 className={css({ textStyle: "subtitle", color: "text" })} id="demo-login-heading">
          원클릭 데모 로그인
        </h2>
        <p className={stepNoteStyle}>시드 계정으로 바로 들어갑니다. 인증 절차를 건너뜁니다.</p>
        {demoAccounts.map((account) => (
          // Card 는 div 기반이라 button 속성을 못 받는다 — 스타일(cva)만 빌려 쓴다
          <button
            key={account.role}
            type="button"
            className={cx(cardRecipe({ padding: "sm", interactive: true }), demoRowStyle)}
            disabled={busy}
            onClick={() => handleDemoLogin(account.role)}
            data-testid={`demo-login-${account.role}`}
          >
            <span>
              <span className={demoLabelStyle}>{account.label}</span>
              <span className={demoDescStyle}>{account.description}</span>
            </span>
            <span className={demoNameStyle}>{account.name}</span>
          </button>
        ))}
      </section>
    </div>
  );
}
