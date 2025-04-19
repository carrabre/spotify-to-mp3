// app/api/direct-download/route.ts
import { type NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get("videoId")
  const title = req.nextUrl.searchParams.get("title") || "track"
  const artist = req.nextUrl.searchParams.get("artist") || ""
  const requestId = Date.now().toString()

  console.log(`[direct-download][${requestId}] Starting download for videoId: ${videoId}`)

  if (!videoId) {
    console.error(`[direct-download][${requestId}] Error: No videoId provided`)
    return NextResponse.json({ error: "Video ID is required" }, { status: 400 })
  }

  try {
    // Create a sanitized filename
    const sanitizedFilename = `${title.replace(/[^a-z0-9]/gi, "_")}${
      artist ? "_" + artist.replace(/[^a-z0-9]/gi, "_") : ""
    }.mp3`

    // Instead of returning HTML or redirecting to Y2Mate,
    // return a JSON response with alternative download options
    return NextResponse.json({
      error: "Direct download not available",
      message: "The direct download method is not available. Please use one of the alternative download options.",
      videoId,
      title,
      artist,
      alternativeDownloadUrls: [
        {
          name: "YouTube to MP3 Converter",
          url: `https://loader.to/api/button/?url=https://www.youtube.com/watch?v=${videoId}&f=mp3`,
          description: "High quality MP3 converter",
        },
        {
          name: "Convert2MP3",
          url: `https://convert2mp3s.com/api/widget?url=https://www.youtube.com/watch?v=${videoId}`,
          description: "Simple MP3 converter",
        }
      ]
    }, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    })
  } catch (error) {
    console.error(`[direct-download][${requestId}] Error:`, error)
    return NextResponse.json(
      {
        error: "Failed to process download",
        details: error instanceof Error ? error.message : String(error),
        requestId,
      },
      { status: 500 },
    )
  }
}
