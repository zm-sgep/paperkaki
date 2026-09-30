import type { NextConfig } from "next";

// Validates the environment when Next.js loads its config, so a bad or missing
// variable stops `next dev`, `next build` and `next start` with a clear message.
import "./src/config/env";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // PGlite loads its WebAssembly files relative to its own package; bundling it breaks that.
  serverExternalPackages: ["@electric-sql/pglite", "pdfjs-dist"],
  experimental: {
    // The school-notice upload posts up to 10 MB of files with the form.
    serverActions: { bodySizeLimit: "12mb" },
    proxyClientMaxBodySize: "12mb",
  },
};

export default nextConfig;
