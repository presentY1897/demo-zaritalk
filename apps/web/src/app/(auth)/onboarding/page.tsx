import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { css } from "styled-system/css";
import { OnboardingForm } from "@/features/profiles/OnboardingForm";
import { verifySignupTicket } from "@/lib/auth/otp";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "가입 정보 입력 — 자리 데모",
  description: "이름과 프로필 유형을 정하고 시작합니다",
};

const expiredStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "3",
  py: "12",
  textStyle: "body",
  color: "text",
});
const linkStyle = css({ color: "text.brand", textDecoration: "underline" });

type PageProps = {
  searchParams: Promise<{ ticket?: string | string[] }>;
};

/**
 * `/onboarding` — 이름 + 프로필 유형 선택 (T0.4).
 *
 * - `?ticket=…` 이 있으면 **가입 플로우**: OTP 검증으로 받은 1회용 티켓을 서버에서 확인해
 *   전화번호를 미리 채운다(소진은 `POST /api/profiles` 가 한다).
 * - 티켓 없이 로그인 상태로 들어오면 **프로필 추가** 모드.
 * - 둘 다 아니면 로그인 화면으로 보낸다.
 */
export default async function OnboardingPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const ticket = typeof params.ticket === "string" ? params.ticket : undefined;
  const user = await getCurrentUser();

  if (ticket) {
    const checked = await verifySignupTicket(ticket);
    if (checked.ok) {
      return <OnboardingForm mode="SIGNUP" ticket={ticket} phone={checked.phone} />;
    }
    return (
      <div className={expiredStyle}>
        <h1 className={css({ textStyle: "title" })}>가입 정보가 만료됐어요</h1>
        <p className={css({ color: "text.muted" })}>
          인증 후 10분이 지났거나 이미 사용한 요청입니다. 인증번호부터 다시 받아 주세요.
        </p>
        <Link className={linkStyle} href="/login">
          로그인 화면으로 가기
        </Link>
      </div>
    );
  }

  if (!user) redirect("/login");

  return (
    <OnboardingForm
      mode="ADD_PROFILE"
      phone={user.phone}
      defaultName={user.name}
      existingTypes={user.profiles.map((profile) => profile.type)}
    />
  );
}
