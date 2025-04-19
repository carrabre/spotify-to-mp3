import { NextRequest, NextResponse } from "next/server"
import { fetchSpotifyData } from "@/lib/spotify"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const spotifyUrl = searchParams.get('url')

    if (!spotifyUrl) {
      return NextResponse.json({ error: 'No Spotify URL provided' }, { status: 400 })
    }

    const tracks = await fetchSpotifyData(spotifyUrl)
    return NextResponse.json(tracks)
  } catch (error) {
    console.error('Error in Spotify API route:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch Spotify data' },
      { status: 500 }
    )
  }
} 