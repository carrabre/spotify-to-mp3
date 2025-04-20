/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  compiler: {
    removeConsole: process.env.NODE_ENV === "production" ? {
      exclude: ['error', 'warn'],
    } : false,
  },
  images: {
    domains: ['i.ytimg.com', 'i.scdn.co'],
    formats: ['image/avif', 'image/webp'],
  },
  poweredByHeader: false,
  experimental: {
    optimizeCss: true,
    optimizeServerReact: true,
  },
  // Optimize output for Vercel Pro deployment
  output: 'standalone',
  // Configure serverless function optimization
  serverRuntimeConfig: {
    concurrentRequests: 4, // Limit concurrent requests to YouTube API
  },
}

module.exports = nextConfig 