import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/reset-password",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
      {
        source: "/api/auth/reset-password/:path*",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
      { source: "/admin/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
    ];
  },
  logging: {
    incomingRequests: {
      ignore: [/\/api\/auth\/verify-email(?:\?|$)/, /\/(?:api\/auth\/)?reset-password(?:[/?]|$)/],
    },
  },
  transpilePackages: ["@repurposepro/config", "@repurposepro/shared"],
};

export default nextConfig;
