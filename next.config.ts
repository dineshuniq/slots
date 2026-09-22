import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // postgres.js is a pure-Node driver; keep it external so it is not bundled
  // into the serverless function output by webpack/turbopack.
  serverExternalPackages: ["postgres"],
};

export default nextConfig;
