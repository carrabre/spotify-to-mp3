export const runtime = "nodejs"
export const dynamic = "force-dynamic" // disables static caching

// Force the Node.js runtime on Vercel / Next 14
// import { runtime } from "next" - removing this as we're using export const runtime instead

import { type NextRequest, NextResponse } from "next/server"
import SYTDL from "s-ytdl"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const videoId = searchParams.get("videoId")
  const title = searchParams.get("title") || "track"
  const artist = searchParams.get("artist") || ""
  const quality = searchParams.get("quality") || "4" // Default to 192kbps
  const requestId = Date.now().toString() // Unique ID for this request to track in logs

  console.log(`[s-ytdl-download][${requestId}] Starting download request for videoId: ${videoId}`)
  console.log(`[s-ytdl-download][${requestId}] Title: "${title}", Artist: "${artist}", Quality: ${quality}`)

  if (!videoId) {
    console.error(`[s-ytdl-download][${requestId}] Error: No videoId provided`)
    return NextResponse.json({ error: "Video ID is required" }, { status: 400 })
  }

  try {
    // YouTube URL from video ID
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`
    console.log(`[s-ytdl-download][${requestId}] YouTube URL: ${youtubeUrl}`)

    // Create a sanitized filename - use .webm extension since we're not transcoding
    const sanitizedFilename = `${title.replace(/[^a-z0-9]/gi, "_")}${
      artist ? "_" + artist.replace(/[^a-z0-9]/gi, "_") : ""
    }.webm`
    console.log(`[s-ytdl-download][${requestId}] Sanitized filename: ${sanitizedFilename}`)

    console.log(`[s-ytdl-download][${requestId}] Calling s-ytdl.dl with quality: ${quality}`)
    console.time(`[s-ytdl-download][${requestId}] s-ytdl.dl execution time`)

    // Download using s-ytdl
    const downloadResult = await SYTDL.dl(youtubeUrl, quality, "audio").catch((error) => {
      console.error(`[s-ytdl-download][${requestId}] s-ytdl.dl error:`, error)
      throw error
    })

    console.timeEnd(`[s-ytdl-download][${requestId}] s-ytdl.dl execution time`)

    if (!downloadResult || !downloadResult.url) {
      console.error(`[s-ytdl-download][${requestId}] Error: No download URL returned from s-ytdl`)
      throw new Error("Failed to get download URL from s-ytdl")
    }

    console.log(`[s-ytdl-download][${requestId}] Got download URL: ${downloadResult.url.substring(0, 50)}...`)
    console.log(`[s-ytdl-download][${requestId}] Download metadata:`, {
      title: downloadResult.title,
      duration: downloadResult.duration,
      size: downloadResult.size,
      thumbnail: downloadResult.thumbnail ? "Present" : "Not present",
    })

    // Fetch the audio file
    console.log(`[s-ytdl-download][${requestId}] Fetching audio file from URL`)
    console.time(`[s-ytdl-download][${requestId}] Audio fetch time`)

    // Add request headers to potentially improve download reliability
    const response = await fetch(downloadResult.url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        Accept: "*/*",
        "Accept-Encoding": "gzip, deflate, br",
        Connection: "keep-alive",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    }).catch((error) => {
      console.error(`[s-ytdl-download][${requestId}] Fetch error:`, error)
      throw error
    })

    console.timeEnd(`[s-ytdl-download][${requestId}] Audio fetch time`)

    if (!response.ok) {
      console.error(`[s-ytdl-download][${requestId}] Fetch response not OK: ${response.status} ${response.statusText}`)
      throw new Error(`Failed to download audio: ${response.statusText}`)
    }

    if (!response.body) {
      console.error(`[s-ytdl-download][${requestId}] Response has no body`)
      throw new Error("Response has no body")
    }

    // Check content type from response
    const contentType = response.headers.get("Content-Type") || "audio/webm"
    console.log(`[s-ytdl-download][${requestId}] Content-Type from response: ${contentType}`)

    // Set headers for file download - use correct MIME type
    const headers = new Headers()
    headers.set("Content-Disposition", `attachment; filename="${sanitizedFilename}"`)
    headers.set("Content-Type", contentType)
    headers.set("X-Request-ID", requestId)

    console.log(`[s-ytdl-download][${requestId}] Streaming response with content type: ${contentType}`)
    return new NextResponse(response.body, {
      status: 200,
      headers,
    })
  } catch (error) {
    console.error(`[s-ytdl-download][${requestId}] Error in download process:`, error)

    // Instead of redirecting to the transcoding endpoint, return an error
    return NextResponse.json(
      {
        error: "Failed to download audio",
        details: error instanceof Error ? error.message : String(error),
        requestId: requestId,
      },
      { status: 500 },
    )
  }
}
