import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@zari/ui", "@zari/db"],
};

export default nextConfig;
