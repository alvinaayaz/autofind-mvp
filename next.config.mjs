/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: [
    "@cloudflare/playwright",
  ],
};

export default nextConfig;