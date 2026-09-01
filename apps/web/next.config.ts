import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@zari/ui", "@zari/db"],
  // Playwright(E2E)가 127.0.0.1 로 dev 서버에 붙는다
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
