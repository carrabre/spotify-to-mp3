/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  serverExternalPackages: [
    'fluent-ffmpeg',
    'yt-dlp-exec',
  ],
}

export default nextConfig
