import { defineConfig } from "@pandacss/dev";
import {
  zariGlobalCss,
  zariThemeExtend,
  zariUiIncludeGlob,
} from "@zari/ui/theme";

export default defineConfig({
  preflight: true,
  // @zari/ui 소스를 함께 스캔해야 공용 컴포넌트의 cva variant CSS 가 여기서 생성된다
  include: ["./src/**/*.{ts,tsx}", zariUiIncludeGlob],
  exclude: [],
  outdir: "styled-system",
  jsxFramework: "react",
  globalCss: zariGlobalCss,
  // 토큰·textStyle·keyframes 는 packages/ui/src/theme.ts 한 곳에서만 정의한다(중복 선언 금지)
  theme: { extend: zariThemeExtend },
});
