import { type NextRequest, NextResponse } from "next/server"
import SYTDL from "s-ytdl"
import ffmpegStatic from "ffmpeg-static"
import { execFile } from "child_process"
import fs from "fs"
import os from "os"
import path from "path"
import { Readable } from "stream"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300 // 5 minute timeout

export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get("videoId")
  const title = req.nextUrl.searchParams.get("title") || "track"
  const artist = req.nextUrl.searchParams.get("artist") || ""
  const quality = req.nextUrl.searchParams.get("quality") || "4" // Default to high quality
  const requestId = Date.now().toString()

  console.log(`[download-binary][${requestId}] Starting download for videoId: ${videoId}, quality: ${quality}`)

  if (!videoId) {
    console.error(`[download-binary][${requestId}] Error: No videoId provided`)
    return NextResponse.json({ error: "Missing videoId" }, { status: 400 })
  }

  try {
    // Create a sanitized filename
    const sanitizedFilename = `${title.replace(/[^a-z0-9]/gi, "_")}${
      artist ? "_" + artist.replace(/[^a-z0-9]/gi, "_") : ""
    }.mp3`

    // Create temp directory
    const tempDir = path.join(os.tmpdir(), "spotify-to-mp3-binary")
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }

    const outFile = path.join(tempDir, `${requestId}_${sanitizedFilename}`)

    // 1) Download audio using s-ytdl with a specific quality setting
    console.log(`[download-binary][${requestId}] Downloading audio with s-ytdl using quality: ${quality}`)
    let audioBuffer: Buffer

    try {
      const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`
      
      // Use the specified quality or fallback to "3" (128kbps) if the higher quality fails
      try {
        console.log(`[download-binary][${requestId}] Trying quality ${quality}`)
        audioBuffer = await SYTDL.dl(youtubeUrl, quality, "audio")
      } catch (qualityError) {
        console.error(`[download-binary][${requestId}] Error using quality ${quality}, trying fallback quality: 3`, qualityError)
        
        // Try with lower quality
        audioBuffer = await SYTDL.dl(youtubeUrl, "3", "audio")
      }
      
      console.log(`[download-binary][${requestId}] Download complete, buffer size: ${audioBuffer.length} bytes`)

      // Write to temp file - use webm format for the input file
      const inFile = path.join(tempDir, `${requestId}_input.webm`)
      fs.writeFileSync(inFile, audioBuffer)
      console.log(`[download-binary][${requestId}] Wrote input file: ${inFile}`)

      // 2) Transcode to MP3 with FFmpeg using high quality settings
      console.log(`[download-binary][${requestId}] Starting FFmpeg transcoding`)
      await new Promise<void>((resolve, reject) => {
        execFile(
          ffmpegStatic!,
          [
            "-i", inFile,                // Input file
            "-codec:a", "libmp3lame",    // MP3 codec
            "-qscale:a", "2",            // Quality setting (higher quality)
            "-write_xing", "1",          // Write VBR tag
            "-id3v2_version", "3",       // ID3 tag version
            "-metadata", `title=${title}`,
            "-metadata", `artist=${artist}`,
            outFile,                     // Output file
          ],
          (error, stdout, stderr) => {
            console.log(`[download-binary][${requestId}] FFmpeg stdout:`, stdout)
            console.log(`[download-binary][${requestId}] FFmpeg stderr:`, stderr)

            if (error) {
              console.error(`[download-binary][${requestId}] FFmpeg error:`, error)
              reject(new Error(stderr))
              return
            }

            resolve()
          },
        )
      })

      // 3) Verify the output file exists and has content
      if (!fs.existsSync(outFile)) {
        throw new Error(`Output file does not exist: ${outFile}`)
      }

      const fileStats = fs.statSync(outFile)
      console.log(`[download-binary][${requestId}] Output file size: ${fileStats.size} bytes`)

      if (fileStats.size === 0) {
        throw new Error("Output file is empty")
      }

      // 4) Read the file and prepare to send it
      const mp3Data = fs.readFileSync(outFile)
      console.log(`[download-binary][${requestId}] Read ${mp3Data.length} bytes from output file`)

      // 5) Clean up temp files
      try {
        fs.unlinkSync(path.join(tempDir, `${requestId}_input.webm`))
        fs.unlinkSync(outFile)
        console.log(`[download-binary][${requestId}] Cleaned up temp files`)
      } catch (cleanupError) {
        console.error(`[download-binary][${requestId}] Error cleaning up temp files:`, cleanupError)
      }

      // 6) Return the MP3 data with very explicit headers to ensure correct handling
      console.log(`[download-binary][${requestId}] Sending MP3 response with size: ${mp3Data.length} bytes`)

      // Set proper headers for a downloadable binary file
      const headers = new Headers()
      headers.set("Content-Type", "audio/mpeg")
      headers.set("Content-Disposition", `attachment; filename="${sanitizedFilename}"`)
      headers.set("Content-Length", mp3Data.length.toString())
      headers.set("Cache-Control", "no-store, no-cache")
      headers.set("X-Content-Type-Options", "nosniff")
      headers.set("Accept-Ranges", "bytes")
      headers.set("Connection", "close")
      
      // Return the binary data directly as an ArrayBuffer
      return new NextResponse(mp3Data, {
        status: 200,
        headers,
      })
    } catch (downloadError) {
      console.error(`[download-binary][${requestId}] Error in download or FFmpeg:`, downloadError)

      // Return a proper JSON error response
      return NextResponse.json({
        error: "Download failed",
        message: "The direct download method failed. Please try alternative download options.",
        details: downloadError instanceof Error ? downloadError.message : String(downloadError),
      }, { 
        status: 500,
        headers: {
          "Content-Type": "application/json",
        }
      })
    }
  } catch (error) {
    console.error(`[download-binary][${requestId}] Error:`, error)

    // Return a JSON error response
    return NextResponse.json({
      error: "Download failed",
      message: "The download process encountered an error. Please try alternative download options.",
      details: error instanceof Error ? error.message : String(error),
    }, { 
      status: 500,
      headers: {
        "Content-Type": "application/json",
      }
    })
  }
} 