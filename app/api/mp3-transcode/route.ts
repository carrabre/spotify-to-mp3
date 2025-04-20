// app/api/mp3-transcode/route.ts
import { type NextRequest, NextResponse } from "next/server"
import SYTDL from "s-ytdl"
import ffmpegStatic from "ffmpeg-static"
import { execFile } from "child_process"
import fs from "fs"
import os from "os"
import path from "path"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Helper to check if we're on Vercel
const isVercelProd = process.env.VERCEL_ENV === 'production'
const isVercelEnvironment = !!process.env.VERCEL

export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get("videoId")
  const title = req.nextUrl.searchParams.get("title") || "track"
  const artist = req.nextUrl.searchParams.get("artist") || ""
  const requestId = Date.now().toString()

  console.log(`[mp3-transcode][${requestId}] Starting download for videoId: ${videoId}`)
  console.log(`[mp3-transcode][${requestId}] Environment: Vercel=${isVercelEnvironment}, Prod=${isVercelProd}`)
  console.log(`[mp3-transcode][${requestId}] FFmpeg path: ${ffmpegStatic}`)
  console.log(`[mp3-transcode][${requestId}] System info:`, {
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    tempDir: os.tmpdir(),
    freeMem: os.freemem(),
    totalMem: os.totalmem()
  })

  if (!videoId) {
    console.error(`[mp3-transcode][${requestId}] Error: No videoId provided`)
    return NextResponse.json({ error: "Missing videoId" }, { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    // Create a sanitized filename
    const sanitizedFilename = `${title.replace(/[^a-z0-9]/gi, "_")}${
      artist ? "_" + artist.replace(/[^a-z0-9]/gi, "_") : ""
    }.mp3`

    // Create temp directory
    const tempDir = path.join(os.tmpdir(), "mp3-transcode")
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }

    const outFile = path.join(tempDir, `${requestId}_${sanitizedFilename}`)
    console.log(`[mp3-transcode][${requestId}] Output file will be: ${outFile}`)

    // Track whether we're using the simpler method without FFmpeg
    let usedSimpleMethod = false

    // 1) Download audio using s-ytdl
    console.log(`[mp3-transcode][${requestId}] Downloading audio with s-ytdl`)
    let audioBuffer: Buffer

    try {
      audioBuffer = await SYTDL.dl(`https://www.youtube.com/watch?v=${videoId}`, "4", "audio")
      console.log(`[mp3-transcode][${requestId}] Download complete, buffer size: ${audioBuffer.length} bytes`)

      // Check if FFmpeg is available
      if (!ffmpegStatic && isVercelEnvironment) {
        console.warn(`[mp3-transcode][${requestId}] FFmpeg not available in this environment, using direct audio data`)
        usedSimpleMethod = true
      } else {
        // Write to temp file
        const inFile = path.join(tempDir, `${requestId}_input.webm`)
        fs.writeFileSync(inFile, audioBuffer)
        console.log(`[mp3-transcode][${requestId}] Wrote input file: ${inFile}`)

        // 2) Transcode to MP3 with FFmpeg
        console.log(`[mp3-transcode][${requestId}] Starting FFmpeg transcoding`)
        await new Promise<void>((resolve, reject) => {
          execFile(
            ffmpegStatic!,
            [
              "-i",
              inFile,
              "-codec:a",
              "libmp3lame",
              "-qscale:a",
              "2",
              "-write_xing",
              "1",
              "-id3v2_version",
              "3",
              "-metadata",
              `title=${title}`,
              "-metadata",
              `artist=${artist}`,
              outFile,
            ],
            (error, stdout, stderr) => {
              console.log(`[mp3-transcode][${requestId}] FFmpeg stdout:`, stdout)
              console.log(`[mp3-transcode][${requestId}] FFmpeg stderr:`, stderr)

              if (error) {
                console.error(`[mp3-transcode][${requestId}] FFmpeg error:`, error)
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
        console.log(`[mp3-transcode][${requestId}] Output file size: ${fileStats.size} bytes`)

        if (fileStats.size === 0) {
          throw new Error("Output file is empty")
        }

        // 4) Read the file and prepare to send it
        audioBuffer = fs.readFileSync(outFile)
        console.log(`[mp3-transcode][${requestId}] Read ${audioBuffer.length} bytes from output file`)

        // 5) Clean up temp files
        try {
          fs.unlinkSync(path.join(tempDir, `${requestId}_input.webm`))
          fs.unlinkSync(outFile)
          console.log(`[mp3-transcode][${requestId}] Cleaned up temp files`)
        } catch (cleanupError) {
          console.error(`[mp3-transcode][${requestId}] Error cleaning up temp files:`, cleanupError)
        }
      }

      // 6) Return the MP3 data with proper headers
      console.log(`[mp3-transcode][${requestId}] Sending audio response with size: ${audioBuffer.length} bytes, method: ${usedSimpleMethod ? 'direct' : 'transcoded'}`)

      // IMPORTANT: Set the correct headers to ensure the browser treats this as a download
      const headers = new Headers()
      headers.set("Content-Type", usedSimpleMethod ? "audio/webm" : "audio/mpeg")
      headers.set("Content-Disposition", `attachment; filename="${sanitizedFilename}"`)
      headers.set("Content-Length", audioBuffer.length.toString())
      headers.set("Cache-Control", "no-store, no-cache")

      console.log(`[mp3-transcode][${requestId}] Response headers:`, {
        contentType: headers.get("Content-Type"),
        contentDisposition: headers.get("Content-Disposition"),
        contentLength: headers.get("Content-Length")
      })

      // Return the binary data directly
      return new NextResponse(audioBuffer, {
        status: 200,
        headers,
      })
    } catch (downloadError) {
      console.error(`[mp3-transcode][${requestId}] Error in s-ytdl or FFmpeg:`, downloadError)

      // Return a proper error response with explicit content type
      return NextResponse.json({
        error: "Download failed",
        message: "The direct download method failed. Please try alternative download options.",
        details: downloadError instanceof Error ? downloadError.message : String(downloadError),
        timestamp: new Date().toISOString()
      }, { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  } catch (error) {
    console.error(`[mp3-transcode][${requestId}] Error:`, error)

    // Return an error response with explicit content type
    return NextResponse.json({
      error: "Download failed",
      message: "The download process encountered an error. Please try alternative download options.",
      details: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    }, { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
