import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:8000/:path*",
        // si tu veux tester depuis un autre PC -> remplace 127.0.0.1 par ton IP réseau local
      },
    ];
  },
};

export default nextConfig;
