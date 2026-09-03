/**
 * 사이드바 하단의 "누구로 로그인했는가" + 로그아웃 (T6.3).
 *
 * 백오피스에서 지금 누가 보고 있는지는 화면에 늘 떠 있어야 한다 — 심사·처리 기록에 남는
 * 사람이 바로 이 사람이기 때문이다. 전화번호는 마스킹된 값이 내려온다(web 이 가려서 준다).
 *
 * 로그아웃은 `<form action={서버 액션}>` 이라 클라이언트 JS 없이도 동작한다.
 */
import { css } from "styled-system/css";
import { signOutAdminAction } from "./actions";
import type { AdminIdentity as AdminIdentityValue } from "./auth";

const boxStyle = css({
  mt: "auto",
  px: "3",
  pt: "4",
  borderTopWidth: "hairline",
  borderTopStyle: "solid",
  borderColor: "border",
  display: "flex",
  flexDirection: "column",
  gap: "2",
});
const roleStyle = css({ textStyle: "caption", color: "text.muted" });
const nameStyle = css({ textStyle: "body", color: "text", fontWeight: "600" });
const phoneStyle = css({ textStyle: "caption", color: "text.muted", fontFamily: "numeric" });
const buttonStyle = css({
  alignSelf: "flex-start",
  textStyle: "caption",
  color: "text.brand",
  bg: "transparent",
  border: "none",
  p: 0,
  cursor: "pointer",
  textDecoration: "underline",
  _hover: { color: "text" },
});

export function AdminIdentity({ admin }: { admin: AdminIdentityValue }) {
  return (
    <div className={boxStyle} data-testid="admin-identity">
      <span className={roleStyle}>로그인한 관리자</span>
      <span className={nameStyle}>{admin.name}</span>
      <span className={phoneStyle}>{admin.phone}</span>
      <form action={signOutAdminAction}>
        <button type="submit" className={buttonStyle} data-testid="admin-logout">
          로그아웃
        </button>
      </form>
    </div>
  );
}
