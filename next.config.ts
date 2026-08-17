import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Export a fully static app so the local Docker image needs no Node runtime.
  output: "export",
};

export default nextConfig;
