import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@repurposepro/config", "@repurposepro/shared"],
};

export default nextConfig;
