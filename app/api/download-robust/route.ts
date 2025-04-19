import { type NextRequest, NextResponse } from "next/server"
import SYTDL from "s-ytdl"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const videoId = searchParams.get("videoId")
  const title = searchParams.get("title") || "track"
  const artist = searchParams.get("artist") || ""
  const retry = searchParams.get("retry") || "0"
  const requestId = Date.now().toString()

  console.log(`[download-robust][${requestId}] Starting robust download for videoId: ${videoId}, retry: ${retry}`)

  if (!videoId) {
    console.error(`[download-robust][${requestId}] Error: No videoId provided`)
    return NextResponse.json({ error: "Video ID is required" }, { status: 400 })
  }

  try {
    // YouTube URL from video ID
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`
    console.log(`[download-robust][${requestId}] YouTube URL: ${youtubeUrl}`)

    // Create a sanitized filename
    const sanitizedFilename = `${title.replace(/[^a-z0-9]/gi, "_")}${
      artist ? "_" + artist.replace(/[^a-z0-9]/gi, "_") : ""
    }.mp3`
    console.log(`[download-robust][${requestId}] Sanitized filename: ${sanitizedFilename}`)

    // Try different quality settings based on retry attempt
    const qualityOptions = ["4", "3", "2", "1", "0"] // From highest to lowest
    const qualityIndex = Math.min(Number.parseInt(retry), qualityOptions.length - 1)
    const quality = qualityOptions[qualityIndex]

    console.log(`[download-robust][${requestId}] Using quality: ${quality} (retry: ${retry})`)
    console.time(`[download-robust][${requestId}] s-ytdl.dl execution time`)

    // Download using s-ytdl
    const downloadResult = await SYTDL.dl(youtubeUrl, quality, "audio").catch((error) => {
      console.error(`[download-robust][${requestId}] s-ytdl.dl error:`, error)
      throw error
    })

    console.timeEnd(`[download-robust][${requestId}] s-ytdl.dl execution time`)

    if (!downloadResult || !downloadResult.url) {
      console.error(`[download-robust][${requestId}] Error: No download URL returned from s-ytdl`)
      throw new Error("Failed to get download URL from s-ytdl")
    }

    console.log(`[download-robust][${requestId}] Got download URL: ${downloadResult.url.substring(0, 50)}...`)
    console.log(`[download-robust][${requestId}] Download metadata:`, {
      title: downloadResult.title,
      duration: downloadResult.duration,
      size: downloadResult.size,
      thumbnail: downloadResult.thumbnail ? "Present" : "Not present",
    })

    // Fetch the audio file with multiple retries if needed
    console.log(`[download-robust][${requestId}] Fetching audio file from URL`)

    let response = null
    let retryCount = 0
    const maxRetries = 3

    while (retryCount < maxRetries) {
      console.log(`[download-robust][${requestId}] Fetch attempt ${retryCount + 1}/${maxRetries}`)
      console.time(`[download-robust][${requestId}] Audio fetch time (attempt ${retryCount + 1})`)

      try {
        response = await fetch(downloadResult.url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            Accept: "*/*",
            "Accept-Encoding": "gzip, deflate, br",
            Connection: "keep-alive",
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
          },
        })

        console.timeEnd(`[download-robust][${requestId}] Audio fetch time (attempt ${retryCount + 1})`)

        if (response.ok) {
          console.log(`[download-robust][${requestId}] Fetch successful on attempt ${retryCount + 1}`)
          break
        } else {
          console.error(
            `[download-robust][${requestId}] Fetch failed with status ${response.status} ${response.statusText}`,
          )
          retryCount++
        }
      } catch (error) {
        console.error(`[download-robust][${requestId}] Fetch error on attempt ${retryCount + 1}:`, error)
        retryCount++
      }

      if (retryCount < maxRetries) {
        // Wait before retrying (exponential backoff)
        const delay = Math.pow(2, retryCount) * 1000
        console.log(`[download-robust][${requestId}] Waiting ${delay}ms before retry`)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }

    if (!response || !response.ok) {
      throw new Error(`Failed to download audio after ${maxRetries} attempts`)
    }

    // Check if Content-Length header is present
    const contentLength = response.headers.get("Content-Length")
    console.log(`[download-robust][${requestId}] Content-Length header: ${contentLength || "Not provided"}`)

    // Get the audio data
    console.log(`[download-robust][${requestId}] Converting response to arrayBuffer`)
    console.time(`[download-robust][${requestId}] ArrayBuffer conversion time`)

    const audioBuffer = await response.arrayBuffer().catch((error) => {
      console.error(`[download-robust][${requestId}] ArrayBuffer conversion error:`, error)
      throw error
    })

    console.timeEnd(`[download-robust][${requestId}] ArrayBuffer conversion time`)
    console.log(`[download-robust][${requestId}] Audio buffer size: ${audioBuffer.byteLength} bytes`)

    // Verify the buffer size is reasonable
    if (audioBuffer.byteLength < 100 * 1024) {
      console.warn(
        `[download-robust][${requestId}] Warning: Audio file is suspiciously small (${audioBuffer.byteLength} bytes)`,
      )

      // If this is the first attempt and the file is too small, try a different approach
      if (retry === "0") {
        console.log(`[download-robust][${requestId}] File too small, trying alternative download method`)
        return NextResponse.redirect(
          `/api/s-ytdl-download?videoId=${videoId}&title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}&retry=1`,
        )
      }
    }

    // Set headers for file download
    const headers = new Headers()
    headers.set("Content-Disposition", `attachment; filename="${sanitizedFilename}"`)
    headers.set("Content-Type", "audio/mpeg")
    headers.set("Content-Length", audioBuffer.byteLength.toString())
    headers.set("X-Download-ID", requestId)
    headers.set("X-Download-Size", audioBuffer.byteLength.toString())
    headers.set("X-Download-Retry", retry)

    console.log(`[download-robust][${requestId}] Sending response with ${audioBuffer.byteLength} bytes`)
    return new NextResponse(audioBuffer, {
      status: 200,
      headers,
    })
  } catch (error) {
    console.error(`[download-robust][${requestId}] Error in download process:`, error)

    // If this is not the last retry attempt, try a fallback method
    if (Number.parseInt(retry) < 3) {
      console.log(`[download-robust][${requestId}] Attempting fallback download method`)
      return NextResponse.redirect(
        `/api/s-ytdl-download?videoId=${videoId}&title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}&retry=${Number.parseInt(retry) + 1}`,
      )
    }

    return NextResponse.json(
      {
        error: "Failed to download MP3",
        details: error instanceof Error ? error.message : String(error),
        requestId: requestId,
      },
      { status: 500 },
    )
  }
}
