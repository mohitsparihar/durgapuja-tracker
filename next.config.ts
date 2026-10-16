import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { dev }) => {
    if (dev) {
      // Test tooling writes screenshots/logs into the repo; don't hot-reload on them.
      config.watchOptions = {
        ...config.watchOptions,
        ignored: ["**/node_modules/**", "**/.git/**", "**/.playwright-mcp/**", "**/test-results/**"],
      };
    }
    return config;
  },
};

export default nextConfig;
