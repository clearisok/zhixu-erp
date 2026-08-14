import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained Node.js server for Docker and other local hosting.
  output: "standalone",
};

export default nextConfig;
