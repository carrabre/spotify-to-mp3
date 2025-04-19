import { type NextRequest, NextResponse } from "next/server"
import { config } from "@/lib/config"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const videoId = searchParams.get("videoId")
  const title = searchParams.get("title") || "download"

  if (!videoId) {
    return NextResponse.json({ error: "Video ID is required" }, { status: 400 })
  }

  // Redirect to a YouTube to MP3 converter service
  const converterUrl = `https://www.${config.fallbackYouTubeDomain}/youtube/${videoId}`

  return NextResponse.redirect(converterUrl)
}
