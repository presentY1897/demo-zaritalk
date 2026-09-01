/**
 * 공용 컴포넌트의 variant 정의(PandaCSS `cva` = atomic recipe).
 *
 * 정의를 컴포넌트(.tsx)와 분리해 둔 이유:
 *   1. 앱(web/admin) panda 가 `include` 로 이 파일을 정적 추출해 **모든 variant 조합의 CSS**를
 *      런타임 props 와 무관하게 미리 만들어 준다.
 *   2. React 없이 순수 함수라 단위 테스트(`recipes.test.ts`)로 클래스 조합을 검증할 수 있다.
 *
 * 색은 전부 semantic 토큰만 쓴다(하드코딩 색상 0). 대비비는 `../theme.ts` 주석 참조.
 */
import { cva } from "../../styled-system/css";

/** disabled 가 아닐 때만 hover 를 먹이려고 쓰는 셀렉터 */
const HOVER = "&:not(:disabled):not([data-loading]):hover";
const ACTIVE = "&:not(:disabled):not([data-loading]):active";

export const buttonRecipe = cva({
  base: {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "1.5",
    flexShrink: 0,
    fontFamily: "sans",
    whiteSpace: "nowrap",
    textDecoration: "none",
    rounded: "button",
    borderWidth: "hairline",
    borderStyle: "solid",
    borderColor: "transparent",
    cursor: "pointer",
    userSelect: "none",
    transitionProperty: "background-color, border-color, color, box-shadow",
    transitionDuration: "fast",
    transitionTimingFunction: "standard",
    _disabled: {
      cursor: "not-allowed",
      bg: "bg.subtle",
      color: "text.disabled",
      borderColor: "border",
    },
  },
  variants: {
    variant: {
      /** 브랜드 옐로 면 + 잉크 전경 (11.31:1) — 옐로 위 흰 글씨는 절대 쓰지 않는다 */
      primary: {
        bg: "primary",
        color: "primary.fg",
        [HOVER]: { bg: "primary.hover" },
        [ACTIVE]: { bg: "primary.active" },
      },
      /** 흰 면 + 강한 테두리 */
      secondary: {
        bg: "bg.card",
        color: "text",
        borderColor: "border.strong",
        [HOVER]: { bg: "bg.subtle" },
        [ACTIVE]: { bg: "border" },
      },
      /** 면 없는 텍스트 버튼 */
      ghost: {
        bg: "transparent",
        color: "text",
        [HOVER]: { bg: "bg.subtle" },
        [ACTIVE]: { bg: "border" },
      },
      /** 파기·해지 등 되돌릴 수 없는 동작 (흰 전경 5.25:1) */
      danger: {
        bg: "danger",
        color: "danger.fg",
        [HOVER]: { bg: "danger.text" },
        [ACTIVE]: { bg: "danger.text" },
      },
    },
    size: {
      sm: { minH: "36px", px: "3", textStyle: "label", rounded: "field" },
      md: { minH: "tap", px: "4", textStyle: "bodyStrong" },
      lg: { minH: "52px", px: "5", textStyle: "subtitle" },
    },
    fullWidth: {
      /**
       * base 의 `flexShrink: 0` 과 `w: full` 이 겹치면, flex 행에 fullWidth 버튼을
       * 둘 이상 나란히 뒀을 때 각자 100% 폭을 고집해 480px 셸을 뚫는다.
       * fullWidth 일 때만 수축을 허용한다(단독으로 쓰면 여전히 100%).
       */
      true: { w: "full", flexShrink: 1, minW: 0 },
      false: {},
    },
    /** 로딩 중에는 라벨을 감추고 스피너만 보인다 (Button 컴포넌트가 처리) */
    loading: {
      true: { cursor: "progress", pointerEvents: "none" },
      false: {},
    },
  },
  defaultVariants: {
    variant: "primary",
    size: "md",
    fullWidth: false,
    loading: false,
  },
});

export const inputRecipe = cva({
  base: {
    w: "full",
    fontFamily: "sans",
    textStyle: "body",
    color: "text",
    bg: "bg.card",
    rounded: "field",
    borderWidth: "hairline",
    borderStyle: "solid",
    borderColor: "border",
    transitionProperty: "border-color, box-shadow",
    transitionDuration: "fast",
    transitionTimingFunction: "standard",
    _placeholder: { color: "text.muted" },
    _hover: { borderColor: "border.strong" },
    _focusVisible: {
      borderColor: "border.focus",
      boxShadow: "focus",
      outline: "none",
    },
    _disabled: {
      bg: "bg.subtle",
      color: "text.disabled",
      cursor: "not-allowed",
    },
  },
  variants: {
    size: {
      sm: { minH: "36px", px: "3" },
      md: { minH: "tap", px: "3.5" },
      lg: { minH: "52px", px: "4" },
    },
    /** 에러 상태 — 테두리와 헬퍼 텍스트를 danger 로 (색만으로 알리지 않게 문구도 함께 노출) */
    invalid: {
      true: {
        borderColor: "danger",
        _hover: { borderColor: "danger" },
        _focusVisible: { borderColor: "danger", boxShadow: "focus" },
      },
      false: {},
    },
  },
  defaultVariants: { size: "md", invalid: false },
});

export const badgeRecipe = cva({
  base: {
    display: "inline-flex",
    alignItems: "center",
    gap: "1",
    flexShrink: 0,
    fontFamily: "sans",
    whiteSpace: "nowrap",
    rounded: "pill",
    borderWidth: "hairline",
    borderStyle: "solid",
  },
  variants: {
    /** 수납 상태 표시용 — 완납 success / 부분납 warning / 연체 danger / 안내 info / 없음 neutral */
    tone: {
      success: {
        bg: "success.subtle",
        color: "success.text",
        borderColor: "success.border",
      },
      warning: {
        bg: "warning.subtle",
        color: "warning.text",
        borderColor: "warning.border",
      },
      danger: {
        bg: "danger.subtle",
        color: "danger.text",
        borderColor: "danger.border",
      },
      info: { bg: "info.subtle", color: "info.text", borderColor: "info.border" },
      neutral: {
        bg: "neutral.subtle",
        color: "neutral.text",
        borderColor: "neutral.border",
      },
      brand: {
        bg: "primary.subtle",
        color: "text.brand",
        borderColor: "primary.border",
      },
    },
    /** 꽉 찬 면 — 목록에서 한 건만 강조할 때 */
    solid: {
      true: {},
      false: {},
    },
    size: {
      sm: { minH: "20px", px: "2", textStyle: "caption" },
      md: { minH: "26px", px: "2.5", textStyle: "label" },
    },
  },
  compoundVariants: [
    {
      tone: "success",
      solid: true,
      css: { bg: "success", color: "success.fg", borderColor: "success" },
    },
    {
      tone: "warning",
      solid: true,
      css: { bg: "warning", color: "warning.fg", borderColor: "warning" },
    },
    {
      tone: "danger",
      solid: true,
      css: { bg: "danger", color: "danger.fg", borderColor: "danger" },
    },
    {
      tone: "info",
      solid: true,
      css: { bg: "info", color: "info.fg", borderColor: "info" },
    },
    {
      tone: "neutral",
      solid: true,
      css: { bg: "bg.inverse", color: "text.inverse", borderColor: "bg.inverse" },
    },
    {
      tone: "brand",
      solid: true,
      css: { bg: "primary", color: "primary.fg", borderColor: "primary" },
    },
  ],
  defaultVariants: { tone: "neutral", size: "sm", solid: false },
});

export const cardRecipe = cva({
  base: {
    bg: "bg.card",
    color: "text",
    rounded: "card",
    borderWidth: "hairline",
    borderStyle: "solid",
    borderColor: "border",
    boxShadow: "card",
  },
  variants: {
    padding: {
      none: { p: "0" },
      sm: { p: "3" },
      md: { p: "gutter" },
      lg: { p: "section" },
    },
    /** 눌러서 상세로 들어가는 카드 */
    interactive: {
      true: {
        cursor: "pointer",
        textAlign: "left",
        w: "full",
        transitionProperty: "border-color, box-shadow",
        transitionDuration: "fast",
        transitionTimingFunction: "standard",
        _hover: { borderColor: "border.strong", boxShadow: "raised" },
      },
      false: {},
    },
  },
  defaultVariants: { padding: "md", interactive: false },
});

export const sheetOverlayRecipe = cva({
  base: {
    position: "fixed",
    inset: "0",
    bg: "bg.overlay",
    zIndex: "overlay",
    animation: "zariFadeIn {durations.normal} {easings.standard}",
  },
});

export const sheetPanelRecipe = cva({
  base: {
    position: "fixed",
    left: "50%",
    bottom: "0",
    transform: "translateX(-50%)",
    // D5 — 모바일 셸(480px) 안쪽에 맞춰 올라온다
    w: "full",
    maxW: "shell",
    maxH: "sheetMax",
    display: "flex",
    flexDirection: "column",
    bg: "bg.card",
    color: "text",
    borderTopRadius: "sheet",
    boxShadow: "sheet",
    zIndex: "sheet",
    outline: "none",
    animation: "zariSlideUp {durations.slow} {easings.standard}",
    paddingBottom: "env(safe-area-inset-bottom)",
  },
});

export const spinnerRecipe = cva({
  base: {
    display: "inline-block",
    borderWidth: "thick",
    borderStyle: "solid",
    borderColor: "currentColor",
    borderTopColor: "transparent",
    rounded: "pill",
    animation: "zariSpin 700ms linear infinite",
  },
  variants: {
    size: {
      sm: { w: "14px", h: "14px" },
      md: { w: "18px", h: "18px" },
      lg: { w: "22px", h: "22px" },
    },
  },
  defaultVariants: { size: "md" },
});
