import { type NextRequest, NextResponse } from "next/server"
import YTDlpWrap from "yt-dlp-wrap"
import ffmpegStatic from "ffmpeg-static"
import path from "path"
import os from "os"
import fs from "fs"
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
console.log("YT-DLP Path:", ytDlpBinaryPath || "Using default from yt-dlp-wrap")
console.log("FFMPEG Path:", process.env.FFMPEG_PATH || "Not set")

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const videoId = searchParams.get("videoId")
  const title = searchParams.get("title") || "track"
  const artist = searchParams.get("artist") || ""

  if (!videoId) {
    return NextResponse.json({ error: "Video ID is required" }, { status: 400 })
  }

  try {
    console.log(`Starting MP3 download for video ID: ${videoId}`)

    // YouTube URL from video ID
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`

    // Create a sanitized filename
    const sanitizedFilename = `${title.replace(/[^a-z0-9]/gi, "_")}${
      artist ? "_" + artist.replace(/[^a-z0-9]/gi, "_") : ""
    }.mp3`

    // Create a temporary directory for downloads
    const tempDir = path.join(os.tmpdir(), "spotify-to-mp3-downloads")

    // Ensure the directory exists
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }

    // Create a temporary file path
    const outputPath = path.join(tempDir, `${Date.now()}_${sanitizedFilename}`)

    console.log(`Downloading to: ${outputPath}`)

    // Initialize yt-dlp-wrap with the binary path if available
    const ytDlp = ytDlpBinaryPath ? new YTDlpWrap(ytDlpBinaryPath) : new YTDlpWrap()

    // Log all available information about the environment
    console.log("Environment:", {
      platform: process.platform,
      architecture: process.arch,
      nodeVersion: process.version,
      currentDirectory: process.cwd(),
      tempDir: os.tmpdir(),
      homeDir: os.homedir(),
      vercelEnv: process.env.VERCEL_ENV || "not set",
      vercelRegion: process.env.VERCEL_REGION || "not set",
    })

    // Download the audio using yt-dlp-wrap
    try {
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
        process.env.FFMPEG_PATH || ffmpegStatic,
        "-o",
        outputPath,
        "--no-playlist",
        "--no-warnings",
        "--verbose",
      ])
    } catch (ytdlpError) {
      console.error("Error in yt-dlp execution:", ytdlpError)
      throw ytdlpError
    }

    // Check if the file exists
    if (!fs.existsSync(outputPath)) {
      console.error("Output file does not exist after download attempt:", outputPath)
      throw new Error("Downloaded file does not exist")
    }

    // Get file size for Content-Length header
    const stats = fs.statSync(outputPath)
    const fileSize = stats.size

    console.log(`File downloaded successfully. Size: ${fileSize} bytes`)

    // Set headers for file download
    const headers = new Headers()
    headers.set("Content-Disposition", `attachment; filename="${sanitizedFilename}"`)
    headers.set("Content-Type", "audio/mpeg")
    headers.set("Content-Length", fileSize.toString())

    // Create a readable stream from the file
    const fileStream = fs.createReadStream(outputPath)

    // Convert Node.js stream to Web stream
    const readableStream = Readable.toWeb(fileStream) as ReadableStream

    // Return the streaming response
    const response = new NextResponse(readableStream, { headers })

    // Clean up the temporary file after the response is sent
    response
      .clone()
      .blob()
      .then(() => {
        try {
          fs.unlinkSync(outputPath)
          console.log(`Deleted temporary file: ${outputPath}`)
        } catch (error) {
          console.error(`Error deleting temporary file: ${outputPath}`, error)
        }
      })

    return response
  } catch (error) {
    console.error("Error downloading MP3:", error)

    // Try fallback method
    return fallbackDownload(videoId, title, artist)
  }
}

// Fallback download method using an external service
async function fallbackDownload(videoId: string, title: string, artist: string) {
  try {
    console.log(`Using fallback download method for video ID: ${videoId}`)

    // Create a sanitized filename
    const sanitizedFilename = `${title.replace(/[^a-z0-9]/gi, "_")}${
      artist ? "_" + artist.replace(/[^a-z0-9]/gi, "_") : ""
    }.mp3`

    // Redirect to a direct download service that works reliably
    // This is a last resort if our own download fails
    const downloadUrl = `https://api.vevioz.com/api/button/mp3/${videoId}`

    return NextResponse.redirect(downloadUrl)
  } catch (fallbackError) {
    console.error("Fallback download also failed:", fallbackError)
    return NextResponse.json(
      {
        error: "Failed to download MP3",
        details: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
      },
      { status: 500 },
    )
  }
}
