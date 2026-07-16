/** @type {import('next').NextConfig} */
const isDevelopment = process.env.NODE_ENV === "development";

const nextConfig = {
  reactStrictMode: true,
  // Keep dev and production artifacts isolated so `next build` or another
  // dev server cannot corrupt production build output.
  distDir: isDevelopment ? ".next-dev" : ".next-build",
  // Browser requests are proxied through app/api so the client bundle does not
  // depend on a build-time API origin.
};

module.exports = nextConfig;
