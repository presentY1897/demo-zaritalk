import { Badge, Button, Card } from "@zari/ui";
import type { BadgeTone } from "@zari/ui";
import { css } from "styled-system/css";

/**
 * Phase 0 스캐폴딩 백오피스 홈. 업무 화면은 각 Phase에서 세트로 붙는다(D7).
 * 색은 전부 semantic 토큰만 쓴다 — 하드코딩 색상 0.
 */

type Section = {
  key: string;
  label: string;
  desc: string;
  tone: BadgeTone;
  phase: string;
};

const sections: Section[] = [
  { key: "members", label: "회원/프로필", desc: "유형별 회원 조회", tone: "neutral", phase: "Phase 6" },
  { key: "leases", label: "계약/수납", desc: "계약·수납 원장 조회", tone: "neutral", phase: "Phase 6" },
  { key: "refunds", label: "환급 심사", desc: "신청 심사 큐", tone: "info", phase: "Phase 2" },
  { key: "reports", label: "신고 처리", desc: "커뮤니티 모더레이션", tone: "warning", phase: "Phase 4" },
  { key: "messages", label: "발송 이력", desc: "알림톡 시뮬레이터 로그", tone: "neutral", phase: "Phase 6" },
  { key: "metrics", label: "지표", desc: "가입·계약·결제 추이, 퍼널", tone: "success", phase: "Phase 6" },
];

const pageStyle = css({ p: "8", maxW: "1200px", mx: "auto" });
const headStyle = css({
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "4",
  flexWrap: "wrap",
});
const titleStyle = css({ textStyle: "headline", color: "text" });
const leadStyle = css({ textStyle: "body", color: "text.muted", mt: "1" });
const gridStyle = css({
  mt: "8",
  display: "grid",
  gridTemplateColumns: { base: "1fr", md: "repeat(3, 1fr)" },
  gap: "4",
});
const cardTopStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
});
const sectionLabelStyle = css({ textStyle: "subtitle", color: "text" });
const sectionDescStyle = css({ textStyle: "caption", color: "text.muted", mt: "1" });

export default function AdminHomePage() {
  return (
    <main className={pageStyle}>
      <div className={headStyle}>
        <div>
          <h1 className={titleStyle}>자리 데모 백오피스</h1>
          <p className={leadStyle}>
            스캐폴딩 단계 — 업무 화면은 기능 구현과 함께 추가됩니다.
          </p>
        </div>
        <Button variant="secondary" size="sm">
          운영 가이드
        </Button>
      </div>

      <div className={gridStyle}>
        {sections.map((section) => (
          <Card key={section.key} padding="lg">
            <div className={cardTopStyle}>
              <h2 className={sectionLabelStyle}>{section.label}</h2>
              <Badge tone={section.tone}>{section.phase}</Badge>
            </div>
            <p className={sectionDescStyle}>{section.desc}</p>
          </Card>
        ))}
      </div>
    </main>
  );
}
