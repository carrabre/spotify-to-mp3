import { type NextRequest, NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import os from "os"
import JSZip from "jszip"
import { spawn } from 'child_process'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Get yt-dlp path from environment or use default
const YT_DLP_PATH = process.env.YT_DLP_PATH || '/opt/homebrew/bin/yt-dlp'

export async function POST(request: NextRequest) {
  const requestId = Date.now().toString()
  console.log(`[ZipDownload][${requestId}] Starting ZIP download request`)

  try {
    const data = await request.json()
    const { tracks } = data

    console.log(`[ZipDownload][${requestId}] Received request with ${tracks?.length || 0} tracks`)

    if (!tracks || !Array.isArray(tracks) || tracks.length === 0) {
      console.error(`[ZipDownload][${requestId}] Error: No tracks provided in request`)
      return NextResponse.json({ error: "No tracks provided" }, { status: 400 })
    }

    // Create a stream to send progress updates
    const stream = new TransformStream()
    const writer = stream.writable.getWriter()

    // Process in the background and return the stream immediately
    const processPromise = (async () => {
      try {
        // Create a temporary directory for downloads
        const tempDir = path.join(os.tmpdir(), `spotify-to-mp3-zip-${requestId}`)
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true })
        }

        // Create a new ZIP file
        const zip = new JSZip()
        console.log(`[ZipDownload][${requestId}] Created new JSZip instance`)

        // Track successful downloads
        let successCount = 0
        let failCount = 0
        const errors = []

        // Process each track
        for (let i = 0; i < tracks.length; i++) {
          const track = tracks[i]
          const trackId = track.youtubeId
          if (!trackId) continue

          // Send progress update
          const progress = Math.round((i / tracks.length) * 100)
          await writer.write(
            new TextEncoder().encode(
              `data: ${JSON.stringify({
                progress,
                currentTrack: track.name,
                processed: i,
                total: tracks.length
              })}\n\n`
            )
          )

          console.log(`[ZipDownload][${requestId}] Processing track ${i + 1}/${tracks.length}: "${track.name}"`)

          try {
            // Create a sanitized filename
            const sanitizedFilename = `${track.name.replace(/[^a-z0-9]/gi, "_")}${
              track.artists ? "_" + track.artists.join("_").replace(/[^a-z0-9]/gi, "_") : ""
            }.mp3`

            const videoUrl = `https://www.youtube.com/watch?v=${trackId}`
            const tempFile = path.join(tempDir, `${trackId}-${Date.now()}.mp3`)

            console.log(`[ZipDownload][${requestId}][${trackId}] Starting download...`)
            
            if (!fs.existsSync(YT_DLP_PATH)) {
              throw new Error(`yt-dlp not found at path: ${YT_DLP_PATH}`)
            }

            // Use yt-dlp to download and convert to mp3 directly
            const ytDlpProcess = spawn(YT_DLP_PATH, [
              videoUrl,
              '--extract-audio',
              '--audio-format', 'mp3',
              '--audio-quality', '0',
              '--output', tempFile,
              '--no-check-certificate',
              '--no-warnings',
              '--prefer-free-formats',
              '--add-header', 'referer:youtube.com'
            ])

            // Wait for the process to complete
            const exitCode = await new Promise<number>((resolve) => {
              ytDlpProcess.on('close', resolve)
            })

            if (exitCode !== 0) {
              throw new Error(`yt-dlp process failed with exit code ${exitCode}`)
            }

            // Verify the file exists and get its stats
            if (!fs.existsSync(tempFile)) {
              throw new Error(`Output file does not exist at ${tempFile}`)
            }

            const stats = fs.statSync(tempFile)
            if (stats.size === 0) {
              throw new Error('Output file is empty')
            }

            // Read the file and add to ZIP
            const fileData = fs.readFileSync(tempFile)
            zip.file(sanitizedFilename, fileData)

            // Clean up the temp file
            try {
              fs.unlinkSync(tempFile)
            } catch (unlinkError) {
              console.error(`[ZipDownload][${requestId}][${trackId}] Error deleting temp file:`, unlinkError)
            }

            successCount++
          } catch (error) {
            console.error(`[ZipDownload][${requestId}][${trackId}] Error processing track:`, error)
            errors.push({
              track: track.name,
              error: error instanceof Error ? error.message : String(error)
            })
            failCount++
          }
        }

        // Clean up the temp directory
        try {
          fs.rmSync(tempDir, { recursive: true, force: true })
        } catch (error) {
          console.error(`[ZipDownload][${requestId}] Error cleaning up temp directory:`, error)
        }

        // If all downloads failed, send error
        if (successCount === 0 && failCount > 0) {
          await writer.write(
            new TextEncoder().encode(
              `data: ${JSON.stringify({
                type: 'error',
                message: "Failed to download any tracks",
                details: errors
              })}\n\n`
            )
          )
          return
        }

        // Generate the ZIP file
        console.log(`[ZipDownload][${requestId}] Generating ZIP with ${successCount} tracks`)
        const zipBuffer = await zip.generateAsync({ type: "nodebuffer" })

        // Send the final data message with the ZIP
        await writer.write(
          new TextEncoder().encode(
            `data: ${JSON.stringify({
              type: 'complete',
              data: Array.from(zipBuffer)
            })}\n\n`
          )
        )
      } finally {
        await writer.close()
      }
    })()

    // Return the response with the stream
    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    })
  } catch (error) {
    console.error(`[ZipDownload][${requestId}] Error creating ZIP:`, error)
    return NextResponse.json(
      {
        error: "Failed to create ZIP file",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}
