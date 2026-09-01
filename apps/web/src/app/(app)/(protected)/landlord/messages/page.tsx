import type { Metadata } from "next";
import Link from "next/link";
import { Button, Card } from "@zari/ui";
import { css } from "styled-system/css";
import { findLandlordProfile } from "@/features/landlord/ownership";
import { MessagesView } from "@/features/notice/MessagesView";
import { listLandlordMessages, listNoticeTargets } from "@/features/notice/queries";
import { requireUser } from "@/features/shell/session";

/**
 * `/landlord/messages` — 고지서 발송 + 발송 이력 (T1.7).
 *
 * 서버 컴포넌트가 첫 데이터를 읽어 클라이언트 화면에 넘긴다 — `GET /api/landlord/messages` 와
 * **같은 함수**(`listLandlordMessages`)라 모양이 어긋나지 않는다(T1.1 과 같은 패턴).
 *
 * 이 경로는 T0.5 탭바 배정표에 없다(임대인 탭은 홈·자산·중개요청·커뮤니티·마이).
 * 진입점은 T1.9(임대인 홈)의 카드 또는 T1.2(계약 상세)의 「고지서」 링크가 맡는다 —
 * 두 화면 모두 다른 task 소유라 여기서 링크를 심지 않았다.
 */
export const metadata: Metadata = { title: "고지서 — 자리 데모" };

const emptyPageStyle = css({
  px: "gutter",
  py: "section",
  display: "flex",
  flexDirection: "column",
  gap: "gutter",
});
const titleStyle = css({ textStyle: "headline", color: "text" });
const bodyStyle = css({ textStyle: "body", color: "text.muted", mb: "3" });

export default async function LandlordMessagesPage() {
  const user = await requireUser();
  const profile = findLandlordProfile(user);

  if (!profile) {
    return (
      <main className={emptyPageStyle}>
        <h1 className={titleStyle}>고지서</h1>
        <Card padding="md">
          <p className={bodyStyle}>
            고지서 발송은 임대인 프로필에서 씁니다. 임대인 유형을 추가하면 바로 열립니다.
          </p>
          <Link href="/onboarding">
            <Button fullWidth>임대인 프로필 추가</Button>
          </Link>
        </Card>
      </main>
    );
  }

  const [messages, targets] = await Promise.all([
    listLandlordMessages(profile.id),
    listNoticeTargets(profile.id),
  ]);

  return <MessagesView initialMessages={messages} targets={targets} />;
}
