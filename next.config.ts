import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "witnesstree.ca" }],
        destination: "https://www.witnesstree.ca/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
