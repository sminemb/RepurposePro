import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  logging: { incomingRequests: { ignore: [/\/api\/auth\/verify-email(?:\?|$)/] } },
  transpilePackages: ["@repurposepro/config", "@repurposepro/shared"],
};

export default nextConfig;
