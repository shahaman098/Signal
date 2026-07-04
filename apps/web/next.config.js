/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The web app is a thin client over the Express API; nothing to proxy here,
  // it calls NEXT_PUBLIC_API_BASE_URL directly from the browser.
};

module.exports = nextConfig;
