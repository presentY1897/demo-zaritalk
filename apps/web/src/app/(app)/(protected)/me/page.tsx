import { Badge, Card, CardHeader } from "@zari/ui";
import type { Metadata } from "next";
import { css } from "styled-system/css";
import { LogoutButton } from "@/features/profile/LogoutButton";
import { ProfileSwitchSheet } from "@/features/profile/ProfileSwitchSheet";
import { PROFILE_TYPE_DESC, PROFILE_TYPE_LABEL } from "@/features/profile/profile";
import { getActiveProfile, requireUser } from "@/features/shell/session";
import { formatPhone } from "@/lib/phone";

/**
 * `/me` — 마이페이지 (T0.5).
 *
 * 세 가지만 한다: **프로필 전환**(+ 새 유형 추가 진입) · 내 정보 · 로그아웃.
 * 서버 컴포넌트로 현재 사용자·활성 프로필을 읽고, 상태가 필요한 두 조각만 클라이언트다
 * (`ProfileSwitchSheet`, `LogoutButton`).
 */

export const metadata: Metadata = { title: "마이 — 자리 데모" };

const pageStyle = css({
  px: "gutter",
  pt: "section",
  pb: "section",
  display: "flex",
  flexDirection: "column",
  gap: "gutter",
});
const titleStyle = css({ textStyle: "headline", color: "text" });
const activeRowStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "3",
  mb: "3",
});
const activeLabelStyle = css({ textStyle: "title", color: "text" });
const activeDescStyle = css({ textStyle: "caption", color: "text.muted", mt: "1" });
const infoRowStyle = css({
  display: "flex",
  justifyContent: "space-between",
  gap: "3",
  py: "2",
  textStyle: "body",
  borderBottomWidth: "hairline",
  borderBottomStyle: "solid",
  borderBottomColor: "border",
  _last: { borderBottomWidth: "0" },
});
const infoKeyStyle = css({ color: "text.muted" });
const infoValueStyle = css({ color: "text" });
const emptyProfileStyle = css({ textStyle: "caption", color: "text.muted", mb: "3" });

export default async function MyPage() {
  const user = await requireUser();
  const activeProfile = await getActiveProfile(user);

  return (
    <main className={pageStyle}>
      <h1 className={titleStyle}>마이</h1>

      <Card padding="md">
        {activeProfile ? (
          <div className={activeRowStyle}>
            <div>
              <p className={activeLabelStyle}>{PROFILE_TYPE_LABEL[activeProfile.type]}</p>
              <p className={activeDescStyle}>{PROFILE_TYPE_DESC[activeProfile.type]}</p>
            </div>
            <Badge tone="brand" size="md" solid>
              사용 중
            </Badge>
          </div>
        ) : (
          <p className={emptyProfileStyle}>
            아직 프로필이 없습니다. 유형을 추가하면 해당 화면과 탭이 열립니다.
          </p>
        )}
        <ProfileSwitchSheet />
      </Card>

      <Card padding="md">
        <CardHeader title="내 정보" />
        <div className={infoRowStyle}>
          <span className={infoKeyStyle}>이름</span>
          <span className={infoValueStyle}>{user.name}</span>
        </div>
        <div className={infoRowStyle}>
          <span className={infoKeyStyle}>휴대폰</span>
          <span className={infoValueStyle}>{formatPhone(user.phone)}</span>
        </div>
        <div className={infoRowStyle}>
          <span className={infoKeyStyle}>보유 프로필</span>
          <span className={infoValueStyle}>
            {user.profiles.length > 0
              ? user.profiles.map((p) => PROFILE_TYPE_LABEL[p.type]).join(" · ")
              : "없음"}
          </span>
        </div>
      </Card>

      <LogoutButton />
    </main>
  );
}
