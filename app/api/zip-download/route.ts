import { type NextRequest, NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import os from "os"
import JSZip from "jszip"
import YTDlpWrap from "yt-dlp-wrap"
import ffmpegStatic from "ffmpeg-static"
import { Readable } from "stream"

// Set ffmpeg path for yt-dlp to use
process.env.FFMPEG_PATH = ffmpegStatic || process.env.FFMPEG_PATH

// Configure yt-dlp binary path
let ytDlpBinaryPath: string | undefined
// Try to find yt-dlp in various locations
if (fs.existsSync("./.vercel/bin/yt-dlp")) {
  ytDlpBinaryPath = path.resolve("./.vercel/bin/yt-dlp")
} else if (process.env.PATH) {
  // Look for yt-dlp in PATH
  const pathDirs = process.env.PATH.split(path.delimiter)
  for (const dir of pathDirs) {
    const possiblePath = path.join(dir, "yt-dlp")
    if (fs.existsSync(possiblePath)) {
      ytDlpBinaryPath = possiblePath
      break
    }
  }
}

// Log configuration for debugging
console.log("YT-DLP Path (ZIP):", ytDlpBinaryPath || "Using default from yt-dlp-wrap")
console.log("FFMPEG Path (ZIP):", process.env.FFMPEG_PATH || "Not set")

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    const { tracks } = data

    if (!tracks || !Array.isArray(tracks) || tracks.length === 0) {
      return NextResponse.json({ error: "No tracks provided" }, { status: 400 })
    }

    // Log all available information about the environment
    console.log("Environment (ZIP):", {
      platform: process.platform,
      architecture: process.arch,
      nodeVersion: process.version,
      currentDirectory: process.cwd(),
      tempDir: os.tmpdir(),
      homeDir: os.homedir(),
      vercelEnv: process.env.VERCEL_ENV || "not set",
      vercelRegion: process.env.VERCEL_REGION || "not set",
    })

    // Create a temporary directory for downloads
    const tempDir = path.join(os.tmpdir(), "spotify-to-mp3-zip-downloads")

    // Ensure the directory exists
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }

    // Create a new ZIP file
    const zip = new JSZip()

    // Track successful downloads
    let successCount = 0
    let failCount = 0
    const errors = []

    // Initialize yt-dlp-wrap with the binary path if available
    const ytDlp = ytDlpBinaryPath ? new YTDlpWrap(ytDlpBinaryPath) : new YTDlpWrap()

    // Download each track and add to ZIP
    for (const track of tracks) {
      if (!track.youtubeId) continue

      try {
        // Create a sanitized filename
        const sanitizedFilename = `${track.name.replace(/[^a-z0-9]/gi, "_")}${
          track.artists ? "_" + track.artists.join("_").replace(/[^a-z0-9]/gi, "_") : ""
        }.mp3`

        // YouTube URL from video ID
        const youtubeUrl = `https://www.youtube.com/watch?v=${track.youtubeId}`

        // Create the output path
        const outputPath = path.join(tempDir, `${track.youtubeId}_${sanitizedFilename}`)

        console.log(`Downloading ${track.name} to ${outputPath}`)

        // Download the track using yt-dlp-wrap
        await ytDlp.execPromise([
          youtubeUrl,
          "-f",
          "bestaudio",
          "-x",
          "--audio-format",
          "mp3",
          "--audio-quality",
          "0",
          "--embed-metadata",
          "--ffmpeg-location",
          (process.env.FFMPEG_PATH as string) || ffmpegStatic as string,
          "-o",
          outputPath,
          "--no-playlist",
          "--no-warnings",
          "--verbose",
        ])

        // Check if the file exists and has content
        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
          // Read the file and add to ZIP
          const fileData = fs.readFileSync(outputPath)
          zip.file(sanitizedFilename, fileData)

          // Delete the temporary file
          try {
            fs.unlinkSync(outputPath)
          } catch (unlinkError) {
            console.error(`Error deleting temporary file ${outputPath}:`, unlinkError)
          }

          successCount++
        } else {
          throw new Error(`Downloaded file is empty or does not exist: ${outputPath}`)
        }
      } catch (error) {
        console.error(`Error downloading track ${track.name}:`, error)
        errors.push({
          track: track.name,
          error: error instanceof Error ? error.message : String(error),
        })
        failCount++
        // Continue with other tracks even if one fails
      }
    }

    // If all downloads failed, return an error
    if (successCount === 0 && failCount > 0) {
      return NextResponse.json(
        {
          error: "Failed to download any tracks. Please try downloading them individually.",
          details: errors,
        },
        { status: 500 },
      )
    }

    // Generate the ZIP file
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" })

    // Set headers for file download
    const headers = new Headers()
    headers.set("Content-Disposition", `attachment; filename="spotify-tracks.zip"`)
    headers.set("Content-Type", "application/zip")
    headers.set("Content-Length", zipBuffer.length.toString())

    // Convert buffer to stream
    const readable = new Readable()
    readable.push(zipBuffer)
    readable.push(null)
    const readableStream = Readable.toWeb(readable) as ReadableStream

    return new NextResponse(readableStream, {
      status: 200,
      headers,
    })
  } catch (error) {
    console.error("Error creating ZIP file:", error)
    return NextResponse.json(
      {
        error: "Failed to create ZIP file",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
