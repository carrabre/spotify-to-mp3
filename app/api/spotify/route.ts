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

    const tracks = await fetchSpotifyData(url)
    return NextResponse.json(tracks)
  } catch (error) {
    console.error("Error in Spotify API route:", error)
    
    // More detailed error response
    let statusCode = 500
    let errorMessage = error instanceof Error ? error.message : "Unknown error occurred"
    let userMessage = errorMessage
    
    // More specific error codes for different types of errors
    if (errorMessage.includes("credentials are not configured")) {
      statusCode = 503 // Service Unavailable
      errorMessage = "Spotify API credentials are misconfigured. Please check server environment variables."
      userMessage = "Spotify API credentials are misconfigured. Please add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to your Vercel environment variables."
    } else if (errorMessage.includes("Invalid Spotify URL")) {
      statusCode = 400 // Bad Request
    } else if (errorMessage.includes("Failed to fetch")) {
      statusCode = 502 // Bad Gateway
    }
    
    return NextResponse.json(
      { 
        error: userMessage,
        technicalDetails: errorMessage,
        type: error instanceof Error ? error.constructor.name : "Unknown",
        // Include a timestamp for debugging
        timestamp: new Date().toISOString(),
        // Include help text for credential errors
        helpText: statusCode === 503 ? 
          "This is a server configuration issue. Make sure to set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in your Vercel project settings under Environment Variables. You can get these from the Spotify Developer Dashboard." : 
          undefined
      },
      { status: statusCode }
    )
  }
} 