// app/api/mp3-debug/route.ts
import { type NextRequest, NextResponse } from "next/server"
import SYTDL from "s-ytdl"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get("videoId") || "dQw4w9WgXcQ" // Default to a known working video
  const debug = req.nextUrl.searchParams.get("debug") === "true"
  const step = req.nextUrl.searchParams.get("step") || "all"
  const requestId = Date.now().toString()

  console.log(`[mp3-debug][${requestId}] Starting debug for videoId: ${videoId}, step: ${step}`)

  try {
    // Step 1: Just return a simple text response to test if the route works at all
    if (step === "1" || step === "test") {
      return new NextResponse("API route is working correctly", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      })
    }

    // Step 2: Try to download with s-ytdl and return info about the download
    if (step === "2" || step === "download") {
      console.log(`[mp3-debug][${requestId}] Testing s-ytdl download`)
      try {
        const result = await SYTDL.dl(`https://www.youtube.com/watch?v=${videoId}`, "4", "audio")

        return NextResponse.json({
          success: true,
          message: "Download successful",
          size: result.length,
          videoId,
          requestId,
        })
      } catch (downloadError) {
        console.error(`[mp3-debug][${requestId}] s-ytdl error:`, downloadError)
        return NextResponse.json(
          {
            success: false,
            error: "Download failed",
            details: downloadError instanceof Error ? downloadError.message : String(downloadError),
            videoId,
            requestId,
          },
          { status: 500 },
        )
      }
    }

    // Step 3: Download and return the raw audio buffer directly
    if (step === "3" || step === "raw") {
      console.log(`[mp3-debug][${requestId}] Downloading and returning raw audio`)
      const buffer = await SYTDL.dl(`https://www.youtube.com/watch?v=${videoId}`, "4", "audio")

      return new NextResponse(buffer, {
        status: 200,
        headers: {
          "Content-Type": "audio/webm", // or whatever the actual format is
          "Content-Disposition": `attachment; filename="raw_${videoId}.webm"`,
          "Content-Length": buffer.length.toString(),
        },
      })
    }

    // Step 4: Full process but with detailed logging
    console.log(`[mp3-debug][${requestId}] Running full process with detailed logging`)

    // 1) Download raw audio buffer
    console.log(`[mp3-debug][${requestId}] Downloading audio with s-ytdl`)
    const startDownload = Date.now()
    const buffer = await SYTDL.dl(`https://www.youtube.com/watch?v=${videoId}`, "4", "audio")
    const downloadTime = Date.now() - startDownload
    console.log(`[mp3-debug][${requestId}] Download complete in ${downloadTime}ms, buffer size: ${buffer.length} bytes`)

    // If debug mode, return information about the download
    if (debug) {
      return NextResponse.json({
        success: true,
        message: "Download successful",
        size: buffer.length,
        downloadTime,
        videoId,
        requestId,
      })
    }

    // 2) Return the raw buffer directly (no FFmpeg transcoding)
    console.log(`[mp3-debug][${requestId}] Returning raw audio buffer`)
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/webm", // or whatever the actual format is
        "Content-Disposition": `attachment; filename="debug_${videoId}.webm"`,
        "Content-Length": buffer.length.toString(),
      },
    })
  } catch (error) {
    console.error(`[mp3-debug][${requestId}] Error:`, error)
    return NextResponse.json(
      {
        success: false,
        error: "Debug process failed",
        details: error instanceof Error ? error.message : String(error),
        videoId,
        requestId,
      },
      { status: 500 },
    )
  }
}
