import type { ComponentPropsWithoutRef } from "react";
import { cx } from "../../styled-system/css";
import { spinnerRecipe } from "./recipes";

export type SpinnerProps = ComponentPropsWithoutRef<"span"> & {
  size?: "sm" | "md" | "lg";
};

/**
 * 로딩 표시용 원형 스피너. 색은 `currentColor` 를 따라가므로 감싼 쪽 전경색을 그대로 쓴다.
 * 자체로는 의미를 갖지 않으므로 `aria-hidden` — 로딩 여부는 감싼 쪽이 `aria-busy` 로 알린다.
 */
export function Spinner({ size = "md", className, ...rest }: SpinnerProps) {
  return (
    <span
      aria-hidden="true"
      className={cx(spinnerRecipe({ size }), className)}
      {...rest}
    />
  );
}
