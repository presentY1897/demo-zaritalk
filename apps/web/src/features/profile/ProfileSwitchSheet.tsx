"use client";

/**
 * 프로필 전환 시트 (T0.5) — 마이페이지(`/me`)의 진입 버튼 + 바텀시트.
 *
 * 전환은 `POST /api/profiles/active` 한 번이다. 성공하면
 * ① 서버는 쿠키 `zari_profile` 을 갈아 끼우고 ② 클라이언트는 Jotai atom 을 갱신한다.
 * 탭바는 atom 을 구독하므로 **새로고침 없이 그 자리에서** 구성이 바뀐다.
 * `router.refresh()` 는 서버 컴포넌트(마이페이지의 활성 프로필 표기 등)를 맞추기 위한
 * 소프트 갱신이다 — 전체 페이지 리로드가 아니다.
 */
import { Badge, Button, Sheet, useTrack } from "@zari/ui";
import { useAtomValue, useSetAtom } from "jotai";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { css } from "styled-system/css";
import { TRACK_EVENTS } from "@/lib/tracking/events";
import { activeProfileAtom, activeProfileIdAtom, profilesAtom } from "./atoms";
import { PROFILE_TYPE_DESC, PROFILE_TYPE_LABEL, type ProfileSummary } from "./profile";

const listStyle = css({ display: "flex", flexDirection: "column", gap: "2" });
const optionStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "3",
  w: "full",
  minH: "tap",
  px: "gutter",
  py: "3",
  textAlign: "left",
  bg: "bg.card",
  rounded: "card",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "border",
  cursor: "pointer",
  _hover: { bg: "bg.subtle" },
  _disabled: { cursor: "default" },
});
const optionActiveStyle = css({ borderColor: "primary.border", bg: "primary.subtle" });
const optionLabelStyle = css({ display: "block", textStyle: "bodyStrong", color: "text" });
const optionDescStyle = css({
  display: "block",
  textStyle: "caption",
  color: "text.muted",
  mt: "0.5",
});
const emptyStyle = css({
  textStyle: "caption",
  color: "text.muted",
  bg: "bg.subtle",
  rounded: "card",
  p: "gutter",
  lineHeight: "normal",
});
const errorStyle = css({ textStyle: "caption", color: "danger.text", mt: "2" });
const addLinkStyle = css({
  display: "block",
  mt: "3",
  textStyle: "label",
  color: "text.brand",
  textDecoration: "underline",
  textUnderlineOffset: "3px",
});

export function ProfileSwitchSheet() {
  const profiles = useAtomValue(profilesAtom);
  const activeProfile = useAtomValue(activeProfileAtom);
  const setProfiles = useSetAtom(profilesAtom);
  const setActiveProfileId = useSetAtom(activeProfileIdAtom);
  const { track } = useTrack();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const others = profiles.filter((profile) => profile.id !== activeProfile?.id);

  function openSheet() {
    setError(null);
    setOpen(true);
    track(TRACK_EVENTS.PROFILE_SWITCH_OPEN, {
      from: activeProfile?.type ?? null,
      profileCount: profiles.length,
    });
  }

  async function switchTo(target: ProfileSummary) {
    if (target.id === activeProfile?.id) {
      setOpen(false);
      return;
    }
    setPendingId(target.id);
    setError(null);
    try {
      const res = await fetch("/api/profiles/active", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profileId: target.id }),
      });
      if (!res.ok) {
        setError("프로필을 전환하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
      // 응답은 GET /api/me 와 같은 모양 — 목록·활성 프로필을 한 번에 맞춘다
      const me = (await res.json()) as {
        profiles: ProfileSummary[];
        activeProfile: ProfileSummary | null;
      };
      setProfiles(me.profiles.map((p) => ({ id: p.id, type: p.type })));
      setActiveProfileId(me.activeProfile?.id ?? target.id);
      track(TRACK_EVENTS.PROFILE_SWITCH_COMPLETE, {
        from: activeProfile?.type ?? null,
        to: target.type,
      });
      setOpen(false);
      router.refresh();
    } catch {
      setError("네트워크 오류로 전환하지 못했습니다.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <>
      <Button variant="secondary" fullWidth onClick={openSheet}>
        프로필 전환
      </Button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="프로필 전환"
        description="한 계정에서 여러 유형을 오갈 수 있습니다. 전환하면 하단 탭이 바로 바뀝니다."
        footer={
          <Button variant="ghost" fullWidth onClick={() => setOpen(false)}>
            닫기
          </Button>
        }
      >
        <div className={listStyle}>
          {profiles.map((profile) => {
            const isActive = profile.id === activeProfile?.id;
            return (
              <button
                key={profile.id}
                type="button"
                data-profile-option={profile.type}
                className={isActive ? `${optionStyle} ${optionActiveStyle}` : optionStyle}
                onClick={() => void switchTo(profile)}
                disabled={pendingId !== null}
                aria-current={isActive ? "true" : undefined}
              >
                <span>
                  <span className={optionLabelStyle}>{PROFILE_TYPE_LABEL[profile.type]}</span>
                  <span className={optionDescStyle}>{PROFILE_TYPE_DESC[profile.type]}</span>
                </span>
                {isActive ? (
                  <Badge tone="brand" solid>
                    사용 중
                  </Badge>
                ) : pendingId === profile.id ? (
                  <Badge tone="neutral">전환 중…</Badge>
                ) : null}
              </button>
            );
          })}
        </div>

        {others.length === 0 ? (
          <p className={emptyStyle}>
            전환할 다른 프로필이 없습니다. 임대인·세입자·중개인·마스터 중 필요한 유형을 추가하면
            여기서 오갈 수 있습니다.
          </p>
        ) : null}

        {error ? (
          <p className={errorStyle} role="alert">
            {error}
          </p>
        ) : null}

        {/* /onboarding 은 T0.4 담당 — 아직 머지 전이면 404 가 정상이다 */}
        <Link href="/onboarding" className={addLinkStyle}>
          + 새 유형 추가하기
        </Link>
      </Sheet>
    </>
  );
}
