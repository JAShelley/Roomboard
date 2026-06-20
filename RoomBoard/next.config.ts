import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Serve the static marketing landing page at the root URL without
  // showing /site/index.html in the browser's address bar.
  async rewrites() {
    return [
      { source: "/", destination: "/site/index.html" },
      { source: "/site", destination: "/site/index.html" },
    ];
  },

  // Allow the marketing page's Google Fonts and badge images to load.
  async headers() {
    return [
      {
        source: "/site/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default nextConfig;
