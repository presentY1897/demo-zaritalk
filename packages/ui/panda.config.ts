import { defineConfig } from "@pandacss/dev";
import { zariGlobalCss, zariThemeExtend } from "./src/theme";

/**
 * @zari/ui 전용 panda 설정 — **codegen 전용**이다.
 *
 * 공용 컴포넌트가 `../../styled-system/css` 의 `css`/`cva` 를 쓰려면 이 패키지 안에도
 * 생성된 styled-system 이 있어야 한다(런타임 클래스명 계산 + 타입). 실제 CSS 는
 * 앱(web/admin)이 자기 panda 로 뽑는다 — 앱 `include` 에 `packages/ui/src` 가 들어 있어
 * 여기 cva 정의가 그대로 정적 추출된다.
 *
 * 앱과 토큰 설정이 같아야 두 styled-system 이 같은 클래스명을 만들므로,
 * 토큰은 반드시 `src/theme.ts` 한 곳에서만 정의하고 여기서도 spread 한다.
 */
export default defineConfig({
  preflight: false,
  include: ["./src/**/*.{ts,tsx}"],
  exclude: [],
  outdir: "styled-system",
  jsxFramework: "react",
  globalCss: zariGlobalCss,
  theme: { extend: zariThemeExtend },
});
