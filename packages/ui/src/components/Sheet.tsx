"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { css, cx } from "../../styled-system/css";
import { sheetOverlayRecipe, sheetPanelRecipe } from "./recipes";

export type SheetProps = {
  open: boolean;
  /** ESC · 딤 클릭 · 닫기 버튼에서 모두 호출된다 */
  onClose: () => void;
  /** 시트 제목 — `aria-labelledby` 로 연결된다 */
  title: ReactNode;
  /** 제목 아래 보조 설명 */
  description?: ReactNode;
  /** 하단 고정 액션 영역 (보통 Button) */
  footer?: ReactNode;
  children?: ReactNode;
  /** 딤 클릭으로 닫히지 않게 하려면 false (예: 결제 진행 중) */
  closeOnOverlayClick?: boolean;
  className?: string;
};

const headerStyle = css({
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "3",
  px: "gutter",
  pt: "gutter",
});
const titleStyle = css({ textStyle: "title", color: "text" });
const descStyle = css({ textStyle: "caption", color: "text.muted", mt: "1" });
const bodyStyle = css({
  px: "gutter",
  py: "4",
  overflowY: "auto",
  flex: "1",
  minH: "0",
  textStyle: "body",
});
const footerStyle = css({
  px: "gutter",
  pb: "gutter",
  pt: "3",
  borderTopWidth: "hairline",
  borderTopStyle: "solid",
  borderTopColor: "border",
  display: "flex",
  gap: "2",
});
const grabberStyle = css({
  w: "36px",
  h: "4px",
  rounded: "pill",
  bg: "border.strong",
  mx: "auto",
  mt: "2",
  flexShrink: 0,
});
const closeButtonStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  w: "32px",
  h: "32px",
  flexShrink: 0,
  rounded: "pill",
  border: "none",
  bg: "transparent",
  color: "text.muted",
  cursor: "pointer",
  fontSize: "20px",
  lineHeight: "1",
  _hover: { bg: "bg.subtle", color: "text" },
});

/** 포커스 트랩 대상. 화면에서 감춰진 요소는 offsetParent 로 걸러 낸다. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * 하단에서 올라오는 바텀시트(모달).
 *
 * - 배경 딤 + 딤 클릭 닫기(`closeOnOverlayClick`)
 * - ESC 닫기
 * - 최소 포커스 트랩: 열리면 시트로 포커스를 옮기고 Tab 을 시트 안에서 돌린다. 닫히면 원래 요소로 복귀
 * - 열려 있는 동안 body 스크롤 잠금
 * - D5(480px 셸) 기준으로 시트 폭도 `sizes.shell` 을 넘지 않는다
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  footer,
  children,
  closeOnOverlayClick = true,
  className,
}: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  // 포털은 마운트 이후에만 — SSR 에서 document 를 만지지 않는다
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;
      const targets = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (targets.length === 0) {
        // 포커스 갈 곳이 없으면 시트 밖으로 나가지 않게 막기만 한다
        event.preventDefault();
        return;
      }

      const first = targets[0]!;
      const last = targets[targets.length - 1]!;
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;

    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown, true);

    // 열리자마자 시트 안으로 포커스를 옮긴다(패널 자체가 tabIndex=-1)
    panelRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.body.style.overflow = overflow;
      restoreFocusRef.current?.focus();
    };
  }, [open, handleKeyDown]);

  if (!open || !mounted) return null;

  return createPortal(
    <>
      <div
        className={sheetOverlayRecipe()}
        onClick={closeOnOverlayClick ? onClose : undefined}
        // 딤 자체는 보조 수단이라 스크린리더에서 감춘다 (닫기는 ESC·닫기 버튼으로)
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        tabIndex={-1}
        className={cx(sheetPanelRecipe(), className)}
      >
        <div className={grabberStyle} />
        <div className={headerStyle}>
          <div>
            <h2 className={titleStyle}>{title}</h2>
            {description ? <p className={descStyle}>{description}</p> : null}
          </div>
          <button
            type="button"
            className={closeButtonStyle}
            onClick={onClose}
            aria-label="닫기"
          >
            ×
          </button>
        </div>
        <div className={bodyStyle}>{children}</div>
        {footer ? <div className={footerStyle}>{footer}</div> : null}
      </div>
    </>,
    document.body,
  );
}
