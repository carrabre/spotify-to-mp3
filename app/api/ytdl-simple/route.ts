import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const videoId = searchParams.get("videoId")
  const title = searchParams.get("title") || "track"
  const artist = searchParams.get("artist") || ""
  const quality = searchParams.get("quality") || "4" // Default to 192 kbps
  const test = searchParams.get("test") === "true"
  const requestId = Date.now().toString()

  console.log(`[ytdl-simple][${requestId}] Starting request for videoId: ${videoId}, quality: ${quality}`)

  if (!videoId) {
    console.error(`[ytdl-simple][${requestId}] Error: No videoId provided`)
    return NextResponse.json({ error: "Video ID is required" }, { status: 400 })
  }

  try {
    // YouTube URL from video ID
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`
    console.log(`[ytdl-simple][${requestId}] YouTube URL: ${youtubeUrl}`)

    // If this is just a test, return success without trying to use s-ytdl
    if (test) {
      console.log(`[ytdl-simple][${requestId}] Test mode - returning success without using s-ytdl`)
      return NextResponse.json({
        success: true,
        message: "Test successful - API endpoint is working",
        metadata: {
          title: "Test Video",
          duration: "3:32",
          size: "3.5 MB",
        },
      })
    }

    // For actual downloads, use a reliable third-party service
    // Redirect to Y2Mate which is more reliable
    const redirectUrl = `https://www.y2mate.com/youtube-mp3/${videoId}`
    console.log(`[ytdl-simple][${requestId}] Redirecting to: ${redirectUrl}`)
    return NextResponse.redirect(redirectUrl)
  } catch (error) {
    console.error(`[ytdl-simple][${requestId}] Error in request:`, error)
    console.error(`[ytdl-simple][${requestId}] Error stack:`, error instanceof Error ? error.stack : "No stack trace")

    // Return a more user-friendly error response
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        requestId: requestId,
        videoId: videoId,
        quality: quality,
      },
      { status: 500 },
    )
  }
}
