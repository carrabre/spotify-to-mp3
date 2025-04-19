import { NextResponse } from "next/server"

export const dynamic = "force-dynamic" // No caching

export async function GET() {
  return NextResponse.json({
    spotify: {
      clientId: process.env.SPOTIFY_CLIENT_ID || "Not set",
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET || "Not set",
    },
    youtube: {
      apiKey: process.env.YOUTUBE_API_KEY || "Not set",
    },
    nodeEnv: process.env.NODE_ENV || "Not set",
    envVars: Object.keys(process.env).filter(key => 
      key.startsWith('SPOTIFY') || key.startsWith('YOUTUBE')
    ),
  })
} 