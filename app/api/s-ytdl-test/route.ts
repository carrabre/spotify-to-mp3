import { NextResponse } from "next/server"
import SYTDL from "s-ytdl"

export async function GET() {
  console.log("[s-ytdl-test] Starting test")

  try {
    // Test video ID (Rick Astley - Never Gonna Give You Up)
    const videoId = "dQw4w9WgXcQ"
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`

    console.log(`[s-ytdl-test] Testing with URL: ${youtubeUrl}`)
    console.time("[s-ytdl-test] s-ytdl.dl execution time")

    // Try to get download info
    const result = await SYTDL.dl(youtubeUrl, "4", "audio")

    console.timeEnd("[s-ytdl-test] s-ytdl.dl execution time")

    if (!result || !result.url) {
      console.error("[s-ytdl-test] No download URL returned")
      throw new Error("Failed to get download URL")
    }

    console.log(`[s-ytdl-test] Successfully got download URL: ${result.url.substring(0, 50)}...`)

    // Return success with some metadata
    return NextResponse.json({
      success: true,
      message: "s-ytdl is working correctly",
      metadata: {
        title: result.title,
        duration: result.duration,
        size: result.size,
        hasUrl: !!result.url,
        urlPreview: result.url ? result.url.substring(0, 50) + "..." : null,
        hasThumbnail: !!result.thumbnail,
      },
    })
  } catch (error) {
    console.error("[s-ytdl-test] Test failed:", error)

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 },
    )
  }
}
