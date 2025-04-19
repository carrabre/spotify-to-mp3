import { NextResponse } from "next/server"

export async function GET() {
  const requestId = Date.now().toString()
  console.log(`[download-test][${requestId}] Starting test`)

  try {
    // Test with a known working video
    const testVideoId = "dQw4w9WgXcQ" // Rick Astley - Never Gonna Give You Up
    const youtubeUrl = `https://www.youtube.com/watch?v=${testVideoId}`

    // Test if we can fetch the YouTube page (basic connectivity test)
    try {
      const response = await fetch(youtubeUrl, { method: "HEAD" })
      console.log(`[download-test][${requestId}] YouTube connectivity test: ${response.status}`)
    } catch (e) {
      console.error(`[download-test][${requestId}] YouTube connectivity error:`, e)
    }

    // Test our direct-download endpoint
    try {
      const directDownloadUrl = `/api/direct-download?videoId=${testVideoId}&test=true`
      const response = await fetch(directDownloadUrl, { method: "HEAD" })
      console.log(`[download-test][${requestId}] Direct download test: ${response.status}`)
    } catch (e) {
      console.error(`[download-test][${requestId}] Direct download error:`, e)
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      requestId,
      message: "Download test completed successfully",
    })
  } catch (error) {
    console.error(`[download-test][${requestId}] Test failed:`, error)

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
