"use client";

import type { InputHTMLAttributes, ReactNode, Ref } from "react";
import { useId } from "react";
import { css, cx } from "../../styled-system/css";
import { inputRecipe } from "./recipes";

export type InputSize = "sm" | "md" | "lg";

export type InputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "size"
> & {
  /** 필드 위 라벨. 없으면 `aria-label` 을 직접 넘겨야 한다 */
  label?: ReactNode;
  /** 평상시 안내 문구 (error 가 있으면 error 로 대체된다) */
  helper?: ReactNode;
  /** 에러 문구. 넘기면 필드가 invalid 상태가 된다 */
  error?: ReactNode;
  size?: InputSize;
  /** 라벨 옆 필수 표시 */
  required?: boolean;
  ref?: Ref<HTMLInputElement>;
};

const fieldStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1.5",
  w: "full",
});
const labelStyle = css({ textStyle: "label", color: "text" });
const requiredMarkStyle = css({ color: "danger.text", ml: "0.5" });
const helperStyle = css({ textStyle: "caption", color: "text.muted" });
const errorStyle = css({ textStyle: "caption", color: "danger.text" });

/**
 * label · helper · error 슬롯을 가진 텍스트 입력.
 * 에러는 색만이 아니라 **문구**로도 알리고, `aria-describedby` 로 스크린리더에 연결한다.
 */
export function Input({
  label,
  helper,
  error,
  size = "md",
  required = false,
  id,
  className,
  ...rest
}: InputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const helperId = `${inputId}-helper`;
  const errorId = `${inputId}-error`;
  const invalid = Boolean(error);

  return (
    <div className={fieldStyle}>
      {label ? (
        <label className={labelStyle} htmlFor={inputId}>
          {label}
          {required ? (
            <span className={requiredMarkStyle} aria-hidden="true">
              *
            </span>
          ) : null}
        </label>
      ) : null}

      <input
        id={inputId}
        required={required}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : helper ? helperId : undefined}
        className={cx(inputRecipe({ size, invalid }), className)}
        {...rest}
      />

      {invalid ? (
        <p id={errorId} role="alert" className={errorStyle}>
          {error}
        </p>
      ) : helper ? (
        <p id={helperId} className={helperStyle}>
          {helper}
        </p>
      ) : null}
    </div>
  );
}
