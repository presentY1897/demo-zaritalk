"use client";

import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { css, cx } from "../../styled-system/css";
import { buttonRecipe } from "./recipes";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "color"
> & {
  /** 면 스타일. primary 는 브랜드 옐로 + 잉크 전경(11.31:1) */
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** 셸 하단 고정 CTA 처럼 가로 꽉 채울 때 */
  fullWidth?: boolean;
  /** 라벨 자리를 유지한 채 스피너를 띄우고 클릭을 막는다 */
  loading?: boolean;
  /** 라벨 앞뒤 아이콘 */
  startIcon?: ReactNode;
  endIcon?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
};

/** 라벨 폭을 유지해야 로딩 시 버튼이 흔들리지 않는다. */
const labelStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1.5",
});
const labelHiddenStyle = css({ visibility: "hidden" });
const spinnerSlotStyle = css({
  position: "absolute",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  inset: "0",
});

export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  loading = false,
  disabled = false,
  startIcon,
  endIcon,
  children,
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      // 폼 안에서 의도치 않은 submit 이 나지 않도록 기본은 button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-loading={loading ? "" : undefined}
      className={cx(
        buttonRecipe({ variant, size, fullWidth, loading }),
        className,
      )}
      {...rest}
    >
      <span className={cx(labelStyle, loading && labelHiddenStyle)}>
        {startIcon}
        {children}
        {endIcon}
      </span>
      {loading ? (
        <span className={spinnerSlotStyle}>
          <Spinner size={size} />
        </span>
      ) : null}
    </button>
  );
}
