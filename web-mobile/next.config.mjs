/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath: '/m',
  assetPrefix: '/m',
  trailingSlash: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
