/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Browser requests are proxied through app/api so the client bundle does not
  // depend on a build-time API origin.
};

module.exports = nextConfig;
