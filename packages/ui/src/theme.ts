/**
 * 앱(web/admin)의 panda.config.ts 에서 theme.extend 로 병합하는 공유 디자인 토큰.
 * 비공식 데모이므로 실서비스 브랜드 자산을 복제하지 않고 자체 팔레트를 사용한다.
 */

export const zariColors = {
  brand: {
    50: { value: "#EEF4FF" },
    100: { value: "#DCE7FE" },
    200: { value: "#BACFFD" },
    300: { value: "#8FAEF9" },
    400: { value: "#5F87F2" },
    500: { value: "#3B66EA" },
    600: { value: "#2B4FD8" },
    700: { value: "#2440AF" },
    800: { value: "#213788" },
    900: { value: "#1F306C" },
  },
} as const;

export const zariSemanticColors = {
  primary: { value: "{colors.brand.600}" },
  "primary.hover": { value: "{colors.brand.700}" },
  "primary.fg": { value: "{colors.white}" },
  "bg.page": { value: "{colors.gray.50}" },
  "bg.card": { value: "{colors.white}" },
  text: { value: "{colors.gray.900}" },
  "text.muted": { value: "{colors.gray.500}" },
  border: { value: "{colors.gray.200}" },
} as const;
