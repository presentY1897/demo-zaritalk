import type { Metadata } from "next";
import Link from "next/link";
import { css } from "styled-system/css";
import { LoginView } from "@/features/auth/LoginView";
import type { DemoAccountOption } from "@/features/auth/types";
import { DEMO_ACCOUNTS, DEMO_ROLES } from "@/lib/auth/demo-accounts";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "로그인 — 자리 데모",
  description: "전화번호 인증 또는 역할별 원클릭 데모 로그인",
};

const noticeStyle = css({
  mt: "6",
  bg: "bg.subtle",
  rounded: "field",
  p: "3",
  textStyle: "caption",
  color: "text",
  display: "flex",
  justifyContent: "space-between",
  gap: "2",
});
const linkStyle = css({ color: "text.brand", textDecoration: "underline" });

/**
 * `/login` — 전화번호 + 모의 OTP 로그인 화면 (T0.4).
 *
 * `DEMO_ACCOUNTS`(라벨·설명)는 `@zari/db` 에 의존해 서버에서만 읽을 수 있으므로,
 * 여기서 직렬화 가능한 형태로 바꿔 클라이언트 컴포넌트에 넘긴다.
 * 이미 로그인한 상태여도 막지 않는다 — 시연 중 역할을 바꿔 가며 보기 위함이다.
 */
export default async function LoginPage() {
  const user = await getCurrentUser();
  const demoAccounts: DemoAccountOption[] = DEMO_ROLES.map((role) => ({
    role,
    label: DEMO_ACCOUNTS[role].label,
    description: DEMO_ACCOUNTS[role].description,
    name: DEMO_ACCOUNTS[role].name,
    phone: DEMO_ACCOUNTS[role].phone,
  }));

  return (
    <>
      <LoginView demoAccounts={demoAccounts} />
      {user ? (
        <p className={noticeStyle}>
          <span>이미 {user.name} 님으로 로그인되어 있습니다.</span>
          <Link className={linkStyle} href="/">
            홈으로
          </Link>
        </p>
      ) : null}
    </>
  );
}
