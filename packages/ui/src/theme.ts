/**
 * 자리 데모 공유 디자인 토큰 (T0.6 · C1 옐로 브랜드 톤 · D5 480px 모바일 셸)
 *
 * 정의는 이 파일 한 곳에만 둔다. web·admin 의 `panda.config.ts` 는
 * `theme: { extend: zariThemeExtend }` 로 통째로 spread 해서 소비하므로
 * 앱 쪽에 토큰이 중복 선언될 일이 없다.
 *
 * 비공식 데모이므로 실서비스 브랜드 자산을 복제하지 않고 "비슷한 톤의 자체 팔레트"를 쓴다.
 *
 * ## 옐로 브랜드의 대비 원칙
 * 브랜드 옐로(#FFC800)는 명도가 높아 **흰 전경색과는 1.55:1** 로 절대 못 쓴다.
 * 그래서 두 갈래로 나눠 쓴다.
 *   1. 면(버튼·배지 배경)에는 옐로 + 짙은 잉크(neutral.900) 전경 → 11.31:1
 *   2. 선(링크·강조 텍스트)에는 어두운 옐로 계열(brand.800) → 흰 배경에서 5.38:1
 * 아래 semantic 토큰 주석의 숫자는 WCAG 2.1 상대휘도 기준 대비비다(텍스트 AA = 4.5:1,
 * 아이콘·테두리 등 비텍스트 UI = 3:1).
 *
 * @see docs/DECISIONS.md#-c1-ui-톤-2026-09-01-확정
 */

/* ------------------------------------------------------------------ */
/* 원시 토큰 (tokens)                                                   */
/* ------------------------------------------------------------------ */

/**
 * 브랜드 옐로 스케일. 500 이 대표색이고, 600/700 은 hover/active,
 * 800/900 은 "옐로지만 글자로 읽히는" 어두운 계열이다.
 */
export const zariBrandColors = {
  50: { value: "#FFFBEB" },
  100: { value: "#FFF3C4" },
  200: { value: "#FFE88A" },
  300: { value: "#FFDD52" },
  400: { value: "#FFD426" },
  500: { value: "#FFC800" }, // 대표 브랜드 옐로
  600: { value: "#E0AC00" }, // hover
  700: { value: "#B88700" }, // active
  800: { value: "#8A6400" }, // 링크·강조 텍스트 (흰 배경 5.38:1)
  900: { value: "#5C4200" }, // 진한 강조 (흰 배경 9.40:1)
} as const;

/**
 * 웜 그레이. 옐로와 같은 노란기를 아주 옅게 섞어 중립색이 차갑게 튀지 않게 했다.
 * 400 은 테두리 강조용으로 비텍스트 3:1 을 넘기도록 잡았다.
 */
export const zariNeutralColors = {
  50: { value: "#FAFAF9" }, // 페이지 배경
  100: { value: "#F4F4F2" }, // 은은한 면
  200: { value: "#E7E6E2" }, // 기본 테두리
  300: { value: "#D3D1CB" },
  400: { value: "#8E8B84" }, // 강한 테두리 (흰 배경 3.40:1)
  500: { value: "#6E6B63" }, // 보조 텍스트 (흰 배경 5.32:1)
  600: { value: "#56534C" },
  700: { value: "#403E38" },
  800: { value: "#2B2926" },
  900: { value: "#1A1917" }, // 본문 잉크 (흰 배경 17.57:1)
} as const;

/** 수납 완납 표시 등에 쓰는 초록. 500 은 흰 전경 5.04:1. */
export const zariSuccessColors = {
  50: { value: "#E6F5EC" },
  100: { value: "#C6E7D4" },
  500: { value: "#1A7F45" },
  700: { value: "#14663A" },
} as const;

/** 부분납·기한임박 등 주의 표시. 브랜드 옐로와 헷갈리지 않게 주황쪽으로 밀었다. */
export const zariWarningColors = {
  50: { value: "#FDF1E0" },
  100: { value: "#F8DFBC" },
  500: { value: "#A85F05" },
  700: { value: "#8F5206" },
} as const;

/** 연체·삭제 등 위험 표시. */
export const zariDangerColors = {
  50: { value: "#FCEBEA" },
  100: { value: "#F7CFCC" },
  500: { value: "#C7362F" },
  700: { value: "#A32820" },
} as const;

/** 안내·중립 정보 표시. */
export const zariInfoColors = {
  50: { value: "#E8F0FD" },
  100: { value: "#CBDDF9" },
  500: { value: "#2563C7" },
  700: { value: "#1B4C9C" },
} as const;

export const zariColors = {
  brand: zariBrandColors,
  neutral: zariNeutralColors,
  success: zariSuccessColors,
  warning: zariWarningColors,
  danger: zariDangerColors,
  info: zariInfoColors,
} as const;

/** 웹폰트를 받지 않고 한글이 잘 나오는 시스템 스택을 쓴다(데모 로딩 비용 0). */
export const zariFonts = {
  sans: {
    value:
      'Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", system-ui, sans-serif',
  },
  /** 금액·날짜처럼 자릿수가 흔들리면 안 되는 숫자용 */
  numeric: {
    value:
      '"SF Mono", ui-monospace, "Roboto Mono", "D2Coding", Menlo, Consolas, monospace',
  },
} as const;

/** 480px 셸 기준 타입 스케일. 본문 15px 을 기준으로 위아래를 잡았다. */
export const zariFontSizes = {
  caption: { value: "12px" },
  label: { value: "13px" },
  body: { value: "15px" },
  subtitle: { value: "17px" },
  title: { value: "20px" },
  headline: { value: "24px" },
  display: { value: "30px" },
} as const;

export const zariLineHeights = {
  tight: { value: "1.25" },
  snug: { value: "1.4" },
  normal: { value: "1.6" },
} as const;

/** 모바일 셸에서 쓰는 라운드. card/button/sheet 는 용도 이름으로 고정해 흔들리지 않게 한다. */
export const zariRadii = {
  field: { value: "10px" },
  button: { value: "12px" },
  card: { value: "16px" },
  sheet: { value: "20px" },
  pill: { value: "999px" },
} as const;

/** 옐로 톤과 붙어도 탁해지지 않게 그림자는 웜 잉크(neutral.900) 기반으로 옅게. */
export const zariShadows = {
  card: { value: "0 1px 2px rgba(26, 25, 23, 0.06)" },
  raised: { value: "0 4px 12px rgba(26, 25, 23, 0.10)" },
  sheet: { value: "0 -8px 28px rgba(26, 25, 23, 0.18)" },
  focus: { value: "0 0 0 3px rgba(138, 100, 0, 0.35)" },
} as const;

export const zariSizes = {
  /** D5 — 모바일 셸 최대폭 */
  shell: { value: "480px" },
  /** 터치 타깃 최소 높이 */
  tap: { value: "44px" },
  /** 바텀시트가 화면을 다 덮지 않게 하는 상한 */
  sheetMax: { value: "88dvh" },
} as const;

/** 4px 그리드 위의 의미 있는 간격만 이름을 준다(나머지는 panda 기본 스케일 사용). */
export const zariSpacing = {
  /** 셸 좌우 여백 */
  gutter: { value: "16px" },
  /** 섹션 사이 */
  section: { value: "24px" },
  /** 폼 필드 사이 */
  field: { value: "12px" },
} as const;

export const zariBorderWidths = {
  hairline: { value: "1px" },
  thick: { value: "2px" },
} as const;

export const zariDurations = {
  fast: { value: "120ms" },
  normal: { value: "200ms" },
  slow: { value: "320ms" },
} as const;

export const zariEasings = {
  standard: { value: "cubic-bezier(0.2, 0, 0, 1)" },
  exit: { value: "cubic-bezier(0.4, 0, 1, 1)" },
} as const;

export const zariZIndex = {
  sticky: { value: 100 },
  tabbar: { value: 200 },
  overlay: { value: 900 },
  sheet: { value: 1000 },
} as const;

export const zariTokens = {
  colors: zariColors,
  fonts: zariFonts,
  fontSizes: zariFontSizes,
  lineHeights: zariLineHeights,
  radii: zariRadii,
  shadows: zariShadows,
  sizes: zariSizes,
  spacing: zariSpacing,
  borderWidths: zariBorderWidths,
  durations: zariDurations,
  easings: zariEasings,
  zIndex: zariZIndex,
} as const;

/* ------------------------------------------------------------------ */
/* semantic 토큰 (semanticTokens)                                       */
/* ------------------------------------------------------------------ */

/**
 * 화면에서는 원시 토큰(brand.500 …)을 직접 쓰지 않고 아래 semantic 토큰만 쓴다.
 * 주석의 대비비는 "전경 / 배경" 조합 기준이며 전부 WCAG AA 를 넘긴다.
 */
export const zariSemanticColors = {
  // --- 브랜드 면 (배경으로 쓰는 옐로 + 잉크 전경) ---
  primary: { value: "{colors.brand.500}" },
  "primary.hover": { value: "{colors.brand.600}" },
  "primary.active": { value: "{colors.brand.700}" },
  /** 옐로 면 위 전경색. primary 11.31:1 / hover 8.42:1 / active 5.44:1 */
  "primary.fg": { value: "{colors.neutral.900}" },
  /** 선택·강조 배경 (primary.fg 와 15.79:1) */
  "primary.subtle": { value: "{colors.brand.100}" },
  "primary.border": { value: "{colors.brand.300}" },

  // --- 배경 ---
  "bg.page": { value: "{colors.neutral.50}" },
  "bg.card": { value: "{colors.white}" },
  "bg.subtle": { value: "{colors.neutral.100}" },
  "bg.inverse": { value: "{colors.neutral.900}" },
  /** 바텀시트·모달 딤 */
  "bg.overlay": { value: "rgba(26, 25, 23, 0.48)" },

  // --- 텍스트 ---
  /** 본문 — bg.card 17.57:1 / bg.page 16.82:1 / bg.subtle 15.95:1 */
  text: { value: "{colors.neutral.900}" },
  /** 보조 — bg.card 5.32:1 / bg.page 5.10:1 / bg.subtle 4.83:1 */
  "text.muted": { value: "{colors.neutral.500}" },
  /** 어두운 면 위 전경 — bg.inverse 17.57:1 */
  "text.inverse": { value: "{colors.white}" },
  /** 링크·강조 텍스트용 어두운 옐로 — bg.card 5.38:1 / bg.page 5.15:1 / primary.subtle 4.83:1 */
  "text.brand": { value: "{colors.brand.800}" },
  /** 비활성 텍스트(대비 규정 예외 대상) */
  "text.disabled": { value: "{colors.neutral.400}" },

  // --- 선 ---
  border: { value: "{colors.neutral.200}" },
  /** 비텍스트 3:1 충족 — bg.card 3.40:1 / bg.page 3.26:1 */
  "border.strong": { value: "{colors.neutral.400}" },
  /** 포커스 링 — bg.card 5.38:1 */
  "border.focus": { value: "{colors.brand.800}" },

  // --- 상태색 (수납 완납/부분납/연체 표시) ---
  /** 완납 */
  success: { value: "{colors.success.500}" },
  "success.fg": { value: "{colors.white}" }, // 5.04:1
  "success.subtle": { value: "{colors.success.50}" },
  "success.text": { value: "{colors.success.700}" }, // subtle 위 6.23:1 / 흰 배경 7.02:1
  "success.border": { value: "{colors.success.100}" },

  /** 부분납·기한 임박 */
  warning: { value: "{colors.warning.500}" },
  "warning.fg": { value: "{colors.white}" }, // 4.88:1
  "warning.subtle": { value: "{colors.warning.50}" },
  "warning.text": { value: "{colors.warning.700}" }, // subtle 위 5.58:1 / 흰 배경 6.22:1
  "warning.border": { value: "{colors.warning.100}" },

  /** 연체 */
  danger: { value: "{colors.danger.500}" },
  "danger.fg": { value: "{colors.white}" }, // 5.25:1
  "danger.subtle": { value: "{colors.danger.50}" },
  "danger.text": { value: "{colors.danger.700}" }, // subtle 위 6.32:1 / 흰 배경 7.29:1
  "danger.border": { value: "{colors.danger.100}" },

  /** 안내 */
  info: { value: "{colors.info.500}" },
  "info.fg": { value: "{colors.white}" }, // 5.69:1
  "info.subtle": { value: "{colors.info.50}" },
  "info.text": { value: "{colors.info.700}" }, // subtle 위 7.15:1 / 흰 배경 8.20:1
  "info.border": { value: "{colors.info.100}" },

  /** 상태 없음(중립 배지) */
  "neutral.subtle": { value: "{colors.neutral.100}" },
  "neutral.text": { value: "{colors.neutral.700}" }, // subtle 위 9.71:1
  "neutral.border": { value: "{colors.neutral.200}" },
} as const;

export const zariSemanticTokens = {
  colors: zariSemanticColors,
} as const;

/* ------------------------------------------------------------------ */
/* textStyle 프리셋                                                     */
/* ------------------------------------------------------------------ */

/** `textStyle: "title"` 처럼 한 줄로 쓰는 타이포 프리셋. */
export const zariTextStyles = {
  display: {
    value: {
      fontSize: "display",
      lineHeight: "tight",
      fontWeight: "700",
      letterSpacing: "-0.02em",
    },
  },
  headline: {
    value: {
      fontSize: "headline",
      lineHeight: "tight",
      fontWeight: "700",
      letterSpacing: "-0.015em",
    },
  },
  title: {
    value: {
      fontSize: "title",
      lineHeight: "snug",
      fontWeight: "700",
      letterSpacing: "-0.01em",
    },
  },
  subtitle: {
    value: { fontSize: "subtitle", lineHeight: "snug", fontWeight: "600" },
  },
  body: { value: { fontSize: "body", lineHeight: "normal", fontWeight: "400" } },
  bodyStrong: {
    value: { fontSize: "body", lineHeight: "normal", fontWeight: "600" },
  },
  label: { value: { fontSize: "label", lineHeight: "snug", fontWeight: "600" } },
  caption: {
    value: { fontSize: "caption", lineHeight: "snug", fontWeight: "400" },
  },
  /** 금액·기간처럼 자릿수가 흔들리면 안 되는 값 */
  numeric: {
    value: {
      fontFamily: "numeric",
      fontSize: "body",
      lineHeight: "snug",
      fontWeight: "600",
      fontVariantNumeric: "tabular-nums",
    },
  },
} as const;

/* ------------------------------------------------------------------ */
/* keyframes (바텀시트 등)                                              */
/* ------------------------------------------------------------------ */

export const zariKeyframes = {
  zariFadeIn: { from: { opacity: "0" }, to: { opacity: "1" } },
  zariSlideUp: {
    from: { transform: "translateY(100%)" },
    to: { transform: "translateY(0)" },
  },
  zariSpin: {
    from: { transform: "rotate(0deg)" },
    to: { transform: "rotate(360deg)" },
  },
} as const;

/* ------------------------------------------------------------------ */
/* 앱 panda.config 에서 spread 하는 집합                                 */
/* ------------------------------------------------------------------ */

/**
 * `theme: { extend: zariThemeExtend }` 형태로 web·admin 이 동일하게 소비한다.
 * cva 레시피는 `packages/ui/src/components/recipes.ts` 에 있고,
 * 앱 panda 의 `include` 에 `packages/ui/src` 를 넣어 정적 추출된다(`zariUiIncludeGlob`).
 */
export const zariThemeExtend = {
  tokens: zariTokens,
  semanticTokens: zariSemanticTokens,
  textStyles: zariTextStyles,
  keyframes: zariKeyframes,
} as const;

/** 앱 panda.config 의 `include` 에 넣어야 하는 @zari/ui 소스 glob (앱 디렉터리 기준 상대경로). */
export const zariUiIncludeGlob = "../../packages/ui/src/**/*.{ts,tsx}";

/** 앱 panda.config 의 `globalCss` 로 쓰는 기본 문서 스타일. 색은 전부 semantic 토큰. */
export const zariGlobalCss = {
  html: {
    // iOS 웹뷰에서 가로 스크롤 방지
    overflowX: "hidden",
    WebkitTextSizeAdjust: "100%",
  },
  body: {
    fontFamily: "sans",
    textStyle: "body",
    bg: "bg.page",
    color: "text",
  },
  "*:focus-visible": {
    outline: "2px solid",
    outlineColor: "border.focus",
    outlineOffset: "2px",
  },
} as const;
