import type { NextConfig } from "next";

// Validates the environment when Next.js loads its config, so a bad or missing
// variable stops `next dev`, `next build` and `next start` with a clear message.
import "./src/config/env";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
