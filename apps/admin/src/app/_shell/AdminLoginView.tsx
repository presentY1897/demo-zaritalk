"use client";

/**
 * 어드민 로그인 화면 (T6.3).
 *
 * **관리자 전화번호 + 어드민 패스코드** 두 칸이다.
 * - 번호는 *누구인지* 를 고른다 — web 이 `User.isAdmin` 인 계정을 찾는다.
 * - 패스코드는 *들어와도 되는지* 를 증명한다 — 공개 API 로는 얻을 수 없는 서버 환경변수다.
 *
 * (왜 OTP 가 아닌지는 `apps/web/src/features/admin/session.ts` 주석 참고 —
 *  데모의 OTP 는 코드가 공개 응답에 그대로 실려 나온다.)
 *
 * 색은 전부 `@zari/ui` semantic 토큰 — 하드코딩 색상 0.
 */
import { Button, Card, Input } from "@zari/ui";
import { useActionState } from "react";
import { css } from "styled-system/css";
import { signInAdminAction, type AdminSignInState } from "./actions";

const pageStyle = css({
  minH: "100dvh",
  bg: "bg.page",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  px: "gutter",
  py: "8",
});
const cardStyle = css({ w: "full", maxW: "420px" });
const brandStyle = css({ textStyle: "headline", color: "text" });
const leadStyle = css({ textStyle: "body", color: "text.muted", mt: "2" });
const formStyle = css({ display: "flex", flexDirection: "column", gap: "4", mt: "6" });
const errorStyle = css({
  textStyle: "caption",
  color: "danger.text",
  bg: "danger.subtle",
  rounded: "field",
  px: "3",
  py: "2",
});
const hintStyle = css({ textStyle: "caption", color: "text.muted", mt: "5" });

const INITIAL: AdminSignInState = { ok: false, message: null };

export function AdminLoginView() {
  const [state, formAction, pending] = useActionState(signInAdminAction, INITIAL);

  return (
    <main className={pageStyle}>
      <Card padding="lg" className={cardStyle}>
        <h1 className={brandStyle}>자리 데모 백오피스</h1>
        <p className={leadStyle}>
          운영자 전용 화면입니다. 관리자 계정으로 로그인해야 회원·계약·발송·이벤트 조회와 환급
          심사·신고 처리 화면이 열립니다.
        </p>

        <form action={formAction} className={formStyle}>
          <Input
            name="phone"
            label="관리자 전화번호"
            placeholder="010-0000-0000"
            autoComplete="username"
            inputMode="tel"
            required
            data-testid="admin-login-phone"
          />
          <Input
            name="passcode"
            type="password"
            label="어드민 패스코드"
            helper="서버에 설정된 값입니다. 로컬에서는 CRON_SECRET 과 같습니다."
            autoComplete="current-password"
            required
            data-testid="admin-login-passcode"
          />
          {state.message ? (
            <p className={errorStyle} role="alert" data-testid="admin-login-error">
              {state.message}
            </p>
          ) : null}
          <Button type="submit" fullWidth loading={pending} data-testid="admin-login-submit">
            로그인
          </Button>
        </form>

        <p className={hintStyle}>
          로그인은 web 앱의 세션(`Session`)을 그대로 발급받습니다 — 어드민 앱은 그 토큰을
          httpOnly 쿠키에 담아 둘 뿐이고, 관리자 판정은 언제나 web 이 `User.isAdmin` 으로 합니다.
        </p>
      </Card>
    </main>
  );
}
