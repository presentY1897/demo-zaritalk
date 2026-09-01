import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import { css, cx } from "../../styled-system/css";
import { cardRecipe } from "./recipes";

export type CardPadding = "none" | "sm" | "md" | "lg";

export type CardOwnProps<T extends ElementType> = {
  padding?: CardPadding;
  /** 눌러서 상세로 들어가는 카드. 실제 클릭이 필요하면 `as="button"` 과 함께 쓴다 */
  interactive?: boolean;
  /** div 대신 button/article 등으로 렌더 (기본 div) */
  as?: T;
};

/**
 * `as` 로 지정한 태그의 props 를 그대로 받는다 — `as="button"` 이면 `type`·`disabled`,
 * `as="a"` 면 `href` 가 타입에 잡힌다.
 */
export type CardProps<T extends ElementType = "div"> = CardOwnProps<T> &
  Omit<ComponentPropsWithoutRef<T>, keyof CardOwnProps<T>>;

/** padding·border·radius·shadow 를 토큰으로 고정한 표준 카드. */
export function Card<T extends ElementType = "div">({
  padding = "md",
  interactive = false,
  as,
  className,
  children,
  ...rest
}: CardProps<T>) {
  const Tag = (as ?? "div") as ElementType;
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
