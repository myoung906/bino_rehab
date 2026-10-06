import type { NextConfig } from "next";

const buildTarget = process.env.BUILD_TARGET || 'gh-pages';
const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  output: "export",
  basePath: process.env.BUILD_BASE_PATH ?? (buildTarget === 'gh-pages' && isProd ? "/bino_rehab" : ""),
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
