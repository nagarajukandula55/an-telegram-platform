/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Self-contained server bundle used by the Electron desktop build
  // (apps/desktop) — harmless for the normal `next start` deployment too.
  output: "standalone",
};

export default nextConfig;
