import { NextRequest, NextResponse } from "next/server"
import { fetchSpotifyData } from "@/lib/spotify"

export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl.searchParams.get("url")

    if (!url) {
      return NextResponse.json(
        { error: "Missing Spotify URL parameter" },
        { status: 400 }
      )
    }

    const tracks = await fetchSpotifyData(url)
    return NextResponse.json(tracks)
  } catch (error) {
    console.error("Error in Spotify API route:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error occurred" },
      { status: 500 }
    )
  }
} 