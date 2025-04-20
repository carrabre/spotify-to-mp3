/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Removed swcMinify as it's causing a warning
  compiler: {
    removeConsole: process.env.NODE_ENV === "production" ? {
      exclude: ['error', 'warn'],
    } : false,
  },
  env: {
    SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID,
    SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET,
    YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https', hostname: 'i.scdn.co', port: '', pathname: '/**',
      },
      {
        protocol: 'https', hostname: 'i.ytimg.com', port: '', pathname: '/vi/**',
      },
    ],
  },
  experimental: {
    optimizeCss: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // Optimize output for Vercel Pro deployment
  output: 'standalone',
  // Configure serverless function optimization
  serverRuntimeConfig: {
    concurrentRequests: 4, // Limit concurrent requests to YouTube API
  },
  serverExternalPackages: [
    'fluent-ffmpeg',
    'yt-dlp-exec',
  ],
}

module.exports = nextConfig 