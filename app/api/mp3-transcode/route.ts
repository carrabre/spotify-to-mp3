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

export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get("videoId")
  const title = req.nextUrl.searchParams.get("title") || "track"
  const artist = req.nextUrl.searchParams.get("artist") || ""
  const requestId = Date.now().toString()

  console.log(`[mp3-transcode][${requestId}] Starting download for videoId: ${videoId}`)

  if (!videoId) {
    console.error(`[mp3-transcode][${requestId}] Error: No videoId provided`)
    return NextResponse.json({ error: "Missing videoId" }, { status: 400 })
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

    // 1) Download audio using s-ytdl
    console.log(`[mp3-transcode][${requestId}] Downloading audio with s-ytdl`)
    let audioBuffer: Buffer

    try {
      audioBuffer = await SYTDL.dl(`https://www.youtube.com/watch?v=${videoId}`, "4", "audio")
      console.log(`[mp3-transcode][${requestId}] Download complete, buffer size: ${audioBuffer.length} bytes`)

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
      const mp3Data = fs.readFileSync(outFile)
      console.log(`[mp3-transcode][${requestId}] Read ${mp3Data.length} bytes from output file`)

      // 5) Clean up temp files
      try {
        fs.unlinkSync(path.join(tempDir, `${requestId}_input.webm`))
        fs.unlinkSync(outFile)
        console.log(`[mp3-transcode][${requestId}] Cleaned up temp files`)
      } catch (cleanupError) {
        console.error(`[mp3-transcode][${requestId}] Error cleaning up temp files:`, cleanupError)
      }

      // 6) Return the MP3 data with proper headers
      console.log(`[mp3-transcode][${requestId}] Sending MP3 response with size: ${mp3Data.length} bytes`)

      // IMPORTANT: Set the correct headers to ensure the browser treats this as a download
      const headers = new Headers()
      headers.set("Content-Type", "audio/mpeg")
      headers.set("Content-Disposition", `attachment; filename="${sanitizedFilename}"`)
      headers.set("Content-Length", mp3Data.length.toString())
      headers.set("Cache-Control", "no-store, no-cache")

      // Return the binary data directly
      return new NextResponse(mp3Data, {
        status: 200,
        headers,
      })
    } catch (downloadError) {
      console.error(`[mp3-transcode][${requestId}] Error in s-ytdl or FFmpeg:`, downloadError)

      // Instead of redirecting to Y2Mate (which returns HTML instead of MP3),
      // return a proper error response that the client can handle
      return NextResponse.json({
        error: "Download failed",
        message: "The direct download method failed. Please try alternative download options.",
        details: downloadError instanceof Error ? downloadError.message : String(downloadError),
      }, { status: 500 })
    }
  } catch (error) {
    console.error(`[mp3-transcode][${requestId}] Error:`, error)

    // Return an error response instead of redirecting to Y2Mate
    return NextResponse.json({
      error: "Download failed",
      message: "The download process encountered an error. Please try alternative download options.",
      details: error instanceof Error ? error.message : String(error),
    }, { status: 500 })
  }
}
