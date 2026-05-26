/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prevent Next.js from bundling pdf-parse (CJS lib with fs-dependent init code)
  serverExternalPackages: ['pdf-parse'],
};
export default nextConfig;
