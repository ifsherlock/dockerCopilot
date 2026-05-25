/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath: '/m',
  assetPrefix: '/m',
  trailingSlash: true,
  experimental: {
    externalDir: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
