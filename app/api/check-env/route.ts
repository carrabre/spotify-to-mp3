import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json({
    spotify: {
      clientId: process.env.SPOTIFY_CLIENT_ID ? "Set (first 4 chars: " + process.env.SPOTIFY_CLIENT_ID.substring(0, 4) + "...)" : "Not set",
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET ? "Set (first 4 chars: " + process.env.SPOTIFY_CLIENT_SECRET.substring(0, 4) + "...)" : "Not set",
    },
    youtube: {
      apiKey: process.env.YOUTUBE_API_KEY ? "Set (first 4 chars: " + process.env.YOUTUBE_API_KEY.substring(0, 4) + "...)" : "Not set",
    },
    nodeEnv: process.env.NODE_ENV || "Not set",
  })
} 