import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@diprem/core", "@diprem/api"],
};

export default nextConfig;
