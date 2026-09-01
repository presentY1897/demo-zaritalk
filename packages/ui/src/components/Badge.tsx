import type { ComponentPropsWithoutRef } from "react";
import { cx } from "../../styled-system/css";
import { badgeRecipe } from "./recipes";

export type BadgeTone =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral"
  | "brand";

export type BadgeProps = ComponentPropsWithoutRef<"span"> & {
  /** 수납 상태: 완납 success · 부분납 warning · 연체 danger · 안내 info · 미정 neutral */
  tone?: BadgeTone;
  size?: "sm" | "md";
  /** 옅은 면 대신 꽉 찬 면으로 (목록에서 한 건만 강조할 때) */
  solid?: boolean;
};

/** 상태 라벨. 색만으로 뜻을 전하지 않도록 항상 텍스트를 함께 넣는다. */
export function Badge({
  tone = "neutral",
  size = "sm",
  solid = false,
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span className={cx(badgeRecipe({ tone, size, solid }), className)} {...rest}>
      {children}
    </span>
  );
}
