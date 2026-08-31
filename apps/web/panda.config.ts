import { defineConfig } from "@pandacss/dev";
import { zariColors, zariSemanticColors } from "@zari/ui/theme";

export default defineConfig({
  preflight: true,
  include: ["./src/**/*.{ts,tsx}"],
  exclude: [],
  outdir: "styled-system",
  jsxFramework: "react",
  theme: {
    extend: {
      tokens: { colors: zariColors },
      semanticTokens: { colors: zariSemanticColors },
    },
  },
});
