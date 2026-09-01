import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import { css, cx } from "../../styled-system/css";
import { cardRecipe } from "./recipes";

export type CardPadding = "none" | "sm" | "md" | "lg";

export type CardProps = ComponentPropsWithoutRef<"div"> & {
  padding?: CardPadding;
  /** 눌러서 상세로 들어가는 카드. 실제 클릭이 필요하면 `as="button"` 과 함께 쓴다 */
  interactive?: boolean;
  /** div 대신 button/article 등으로 렌더 (기본 div) */
  as?: ElementType;
};

/** padding·border·radius·shadow 를 토큰으로 고정한 표준 카드. */
export function Card({
  padding = "md",
  interactive = false,
  as: Tag = "div",
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <Tag
      className={cx(cardRecipe({ padding, interactive }), className)}
      {...rest}
    >
      {children}
    </Tag>
  );
}

const cardHeaderStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
  mb: "2",
});
const cardTitleStyle = css({ textStyle: "subtitle", color: "text" });
const cardBodyStyle = css({ textStyle: "body", color: "text.muted" });

export type CardHeaderProps = {
  title: ReactNode;
  /** 제목 오른쪽 슬롯 — 보통 Badge */
  aside?: ReactNode;
};

/** 카드 상단 "제목 + 오른쪽 배지" 조합을 매번 다시 짜지 않도록 묶어 둔다. */
export function CardHeader({ title, aside }: CardHeaderProps) {
  return (
    <div className={cardHeaderStyle}>
      <h3 className={cardTitleStyle}>{title}</h3>
      {aside}
    </div>
  );
}

export function CardBody({ children }: { children: ReactNode }) {
  return <div className={cardBodyStyle}>{children}</div>;
}
