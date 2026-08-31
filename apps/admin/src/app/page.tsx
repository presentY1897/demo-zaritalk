import { css } from "styled-system/css";

const sections = [
  { key: "members", label: "회원/프로필", desc: "유형별 회원 조회" },
  { key: "leases", label: "계약/수납", desc: "계약·수납 원장 조회" },
  { key: "refunds", label: "환급 심사", desc: "신청 심사 큐" },
  { key: "reports", label: "신고 처리", desc: "커뮤니티 모더레이션" },
  { key: "messages", label: "발송 이력", desc: "알림톡 시뮬레이터 로그" },
  { key: "metrics", label: "지표", desc: "가입·계약·결제 추이, 퍼널" },
];

export default function AdminHomePage() {
  return (
    <main className={css({ p: "8", maxW: "1200px", mx: "auto" })}>
      <h1 className={css({ fontSize: "2xl", fontWeight: "bold", color: "primary" })}>
        자리 데모 백오피스
      </h1>
      <p className={css({ mt: "1", color: "text.muted", fontSize: "sm" })}>
        스캐폴딩 단계 — 업무 화면은 기능 구현과 함께 추가됩니다.
      </p>

      <div
        className={css({
          mt: "8",
          display: "grid",
          gridTemplateColumns: { base: "1fr", md: "repeat(3, 1fr)" },
          gap: "4",
        })}
      >
        {sections.map((section) => (
          <div
            key={section.key}
            className={css({
              bg: "bg.card",
              border: "1px solid",
              borderColor: "border",
              rounded: "xl",
              p: "5",
            })}
          >
            <h2 className={css({ fontWeight: "semibold" })}>{section.label}</h2>
            <p className={css({ mt: "1", fontSize: "sm", color: "text.muted" })}>
              {section.desc}
            </p>
          </div>
        ))}
      </div>
    </main>
  );
}
