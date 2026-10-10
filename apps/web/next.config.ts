import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/admin/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
    ];
  },
  transpilePackages: ["@repurposepro/config", "@repurposepro/shared"],
};

export default nextConfig;
