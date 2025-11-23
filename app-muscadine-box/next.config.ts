import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    
    // Force resolution of wagmi to the root node_modules to prevent context duplication issues
    // with @morpho-org/simulation-sdk-wagmi
    config.resolve.alias = {
      ...config.resolve.alias,
      'wagmi': path.join(process.cwd(), 'node_modules/wagmi'),
      '@tanstack/react-query': path.join(process.cwd(), 'node_modules/@tanstack/react-query'),
    };

    // Exclude system directories from watching
    config.watchOptions = {
      ...config.watchOptions,
      ignored: [
        "**/node_modules/**",
        "**/.git/**",
        "**/.next/**",
        "**/.Trash/**",
        "**/Library/**",
        "**/.Trash-*/**",
      ],
    };
    return config;
  },
  experimental: {
    turbo: {
      // Turbopack aliases to match Webpack aliases for singleton resolution
      resolveAlias: {
        'wagmi': './node_modules/wagmi',
        '@tanstack/react-query': './node_modules/@tanstack/react-query',
      },
      // Turbopack configuration to prevent scanning system directories
      resolveExtensions: [
        ".js",
        ".jsx",
        ".ts",
        ".tsx",
        ".json",
        ".mjs",
        ".cjs",
      ],
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "static.alchemyapi.io",
      },
    ],
  },
};

export default nextConfig;