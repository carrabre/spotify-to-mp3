import { NextResponse } from "next/server"
import SYTDL from "s-ytdl"

export async function GET() {
  const requestId = Date.now().toString()
  console.log(`[ytdl-diagnostic][${requestId}] Starting diagnostic test`)

  try {
    // Test with a known working video
    const testVideoId = "dQw4w9WgXcQ" // Rick Astley - Never Gonna Give You Up
    const youtubeUrl = `https://www.youtube.com/watch?v=${testVideoId}`

    console.log(`[ytdl-diagnostic][${requestId}] Testing with URL: ${youtubeUrl}`)

    // Test different quality settings
    const results = {}
    const qualities = ["1", "2", "3", "4"]

    for (const quality of qualities) {
      console.log(`[ytdl-diagnostic][${requestId}] Testing quality: ${quality}`)
      console.time(`[ytdl-diagnostic][${requestId}] Quality ${quality} execution time`)

      try {
        const result = await SYTDL.dl(youtubeUrl, quality, "audio")
        console.timeEnd(`[ytdl-diagnostic][${requestId}] Quality ${quality} execution time`)

        results[quality] = {
          success: true,
          hasUrl: !!result.url,
          urlLength: result.url ? result.url.length : 0,
          urlPreview: result.url ? result.url.substring(0, 50) + "..." : null,
          title: result.title,
          duration: result.duration,
          size: result.size,
        }

        // Verify URL is accessible
        if (result.url) {
          try {
            const headResponse = await fetch(result.url, { method: "HEAD" })
            results[quality].urlStatus = headResponse.status
            results[quality].urlAccessible = headResponse.ok
          } catch (e) {
            results[quality].urlError = e instanceof Error ? e.message : String(e)
          }
        }
      } catch (error) {
        console.error(`[ytdl-diagnostic][${requestId}] Error testing quality ${quality}:`, error)
        console.timeEnd(`[ytdl-diagnostic][${requestId}] Quality ${quality} execution time`)

        results[quality] = {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }

    // Test SYTDL version and capabilities
    let sytdlInfo = "Unknown"
    try {
      sytdlInfo = {
        version: SYTDL.version || "Unknown",
        hasVersion: !!SYTDL.version,
        hasDl: typeof SYTDL.dl === "function",
      }
    } catch (e) {
      sytdlInfo = `Error getting version: ${e instanceof Error ? e.message : String(e)}`
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      requestId,
      sytdl: sytdlInfo,
      results,
    })
  } catch (error) {
    console.error(`[ytdl-diagnostic][${requestId}] Diagnostic test failed:`, error)

    return NextResponse.json(
      {
        success: false,
        timestamp: new Date().toISOString(),
        requestId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 },
    )
  }
}
