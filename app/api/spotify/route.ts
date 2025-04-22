import { NextRequest, NextResponse } from "next/server"
import { fetchSpotifyData } from "@/lib/spotify"

export async function GET(request: NextRequest) {
  try {
    console.log("Spotify API route called with params:", {
      searchParams: Object.fromEntries(request.nextUrl.searchParams.entries()),
      vercelEnv: process.env.VERCEL_ENV || "not set",
      vercelRegion: process.env.VERCEL_REGION || "not set",
      hasSpotifyClientId: !!process.env.SPOTIFY_CLIENT_ID,
      hasSpotifyClientSecret: !!process.env.SPOTIFY_CLIENT_SECRET,
    });

    const url = request.nextUrl.searchParams.get("url")

    if (!url) {
      return NextResponse.json(
        { error: "Missing Spotify URL parameter" },
        { status: 400 }
      )
    }

    // Log environment variables (without exposing secrets)
    const envVarKeys = Object.keys(process.env)
      .filter(key => key.startsWith('SPOTIFY') || key.startsWith('NEXT'))
    console.log("Available environment variables:", envVarKeys.join(", "));

    const result = await fetchSpotifyData(url)
    return NextResponse.json(result)
  } catch (error) {
    console.error("Error in Spotify API route:", error)
    
    // Return detailed error information for debugging
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : "An unknown error occurred",
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    )
  }
} 