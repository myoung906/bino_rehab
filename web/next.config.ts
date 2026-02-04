import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/bino_rehab",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
