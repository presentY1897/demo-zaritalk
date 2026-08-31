import { css } from "styled-system/css";

const roles = [
  { key: "landlord", label: "임대인", desc: "수납관리 · 고지서 · 임대장부" },
  { key: "tenant", label: "세입자", desc: "월세 카드결제 · 환급 · 매물 탐색" },
  { key: "realtor", label: "중개인", desc: "공실 중개 요청 수신" },
  { key: "master", label: "마스터", desc: "청소 · 인테리어 · 수리 견적" },
];

export default function HomePage() {
  return (
    <main className={css({ p: "5", display: "flex", flexDir: "column", gap: "5" })}>
      <header className={css({ pt: "10", pb: "2" })}>
        <h1 className={css({ fontSize: "2xl", fontWeight: "bold", color: "primary" })}>
          자리 데모
        </h1>
        <p className={css({ mt: "1", color: "text.muted", fontSize: "sm" })}>
          임대인·세입자·중개인·마스터를 잇는 임대관리 데모 (스캐폴딩 단계)
        </p>
      </header>

      <section className={css({ display: "flex", flexDir: "column", gap: "3" })}>
        {roles.map((role) => (
          <div
            key={role.key}
            className={css({
              bg: "bg.card",
              border: "1px solid",
              borderColor: "border",
              rounded: "xl",
              p: "4",
            })}
          >
            <h2 className={css({ fontWeight: "semibold" })}>{role.label}</h2>
            <p className={css({ mt: "0.5", fontSize: "sm", color: "text.muted" })}>
              {role.desc}
            </p>
          </div>
        ))}
      </section>
    </main>
  );
}
