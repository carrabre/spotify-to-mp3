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

// Function to monitor memory usage
function logMemoryUsage(label: string) {
  const memoryUsage = process.memoryUsage()
  const memUsageMB = {
    rss: Math.round(memoryUsage.rss / 1024 / 1024),
    heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
    heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
    external: Math.round(memoryUsage.external / 1024 / 1024),
    arrayBuffers: Math.round(memoryUsage.arrayBuffers / 1024 / 1024),
  };
  
  console.log(`Memory Usage (${label}):`, {
    rss: `${memUsageMB.rss}MB`, // Resident Set Size
    heapTotal: `${memUsageMB.heapTotal}MB`, // Total Size of the Heap
    heapUsed: `${memUsageMB.heapUsed}MB`, // Heap actually Used
    external: `${memUsageMB.external}MB`, // Memory used by C++ objects bound to JS
    arrayBuffers: `${memUsageMB.arrayBuffers}MB`, // Memory allocated for ArrayBuffers and SharedArrayBuffers
    percentUsed: `${Math.round((memUsageMB.rss / 3009) * 100)}%`, // Percentage of available memory used
  })
  
  // Warn if memory usage is high
  if (memUsageMB.rss > 2700) {
    console.warn(`⚠️ HIGH MEMORY USAGE: ${memUsageMB.rss}MB / 3009MB (${Math.round((memUsageMB.rss / 3009) * 100)}%)`)
  }
  
  return memUsageMB;
}

// Track request durations
function startRequestTimer() {
  const startTime = Date.now();
  return {
    getElapsedTime: () => {
      const elapsed = Date.now() - startTime;
      return {
        ms: elapsed,
        seconds: Math.round(elapsed / 1000),
        pretty: `${Math.round(elapsed / 1000)}s`
      };
    }
  };
}

export async function GET(request: NextRequest) {
  const requestId = Date.now().toString();
  const timer = startRequestTimer();
  console.log(`[${requestId}] Starting MP3 download request`);
  
  logMemoryUsage(`[${requestId}] Start of request`);
  
  const searchParams = request.nextUrl.searchParams
  const videoId = searchParams.get("videoId")
  const title = searchParams.get("title") || "track"
  const artist = searchParams.get("artist") || ""

  if (!videoId) {
    return NextResponse.json({ error: "Video ID is required" }, { status: 400 })
  }

  // TypeScript doesn't recognize the above check as type narrowing in this context
  // so we need to create a new variable of the correct type
  const safeVideoId = String(videoId)

  try {
    console.log(`[${requestId}] Starting MP3 download for video ID: ${safeVideoId}`)

    // YouTube URL from video ID
    const youtubeUrl = `https://www.youtube.com/watch?v=${safeVideoId}`

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

    console.log(`[${requestId}] Downloading to: ${outputPath}`)
    logMemoryUsage(`[${requestId}] Before download`)

    // Initialize yt-dlp-wrap with the binary path if available
    const ytDlp = ytDlpBinaryPath ? new YTDlpWrap(ytDlpBinaryPath) : new YTDlpWrap()

    // Log all available information about the environment
    console.log(`[${requestId}] Environment:`, {
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
    const downloadTimer = startRequestTimer();
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
        (process.env.FFMPEG_PATH as string) || ffmpegStatic as string,
        "-o",
        outputPath,
        "--no-playlist",
        "--no-warnings",
        "--verbose",
      ])
      console.log(`[${requestId}] Download completed in ${downloadTimer.getElapsedTime().pretty}`)
    } catch (ytdlpError) {
      console.error(`[${requestId}] Error in yt-dlp execution:`, ytdlpError)
      logMemoryUsage(`[${requestId}] Download error`)
      throw ytdlpError
    }

    logMemoryUsage(`[${requestId}] After download`)

    // Check if the file exists
    if (!fs.existsSync(outputPath)) {
      console.error(`[${requestId}] Output file does not exist after download attempt:`, outputPath)
      throw new Error("Downloaded file does not exist")
    }

    // Get file size for Content-Length header
    const stats = fs.statSync(outputPath)
    const fileSize = stats.size

    console.log(`[${requestId}] File downloaded successfully. Size: ${fileSize} bytes (${Math.round(fileSize / 1024 / 1024)}MB)`)

    // Set headers for file download
    const headers = new Headers()
    headers.set("Content-Disposition", `attachment; filename="${sanitizedFilename}"`)
    headers.set("Content-Type", "audio/mpeg")
    headers.set("Content-Length", fileSize.toString())

    // Create a readable stream from the file
    const fileStream = fs.createReadStream(outputPath)

    // Convert Node.js stream to Web stream
    const readableStream = Readable.toWeb(fileStream) as ReadableStream

    logMemoryUsage(`[${requestId}] Before sending response`)

    // Return the streaming response
    const response = new NextResponse(readableStream, { headers })

    // Clean up the temporary file after the response is sent
    response
      .clone()
      .blob()
      .then(() => {
        try {
          fs.unlinkSync(outputPath)
          console.log(`[${requestId}] Deleted temporary file: ${outputPath}`)
          console.log(`[${requestId}] Total request duration: ${timer.getElapsedTime().pretty}`)
        } catch (error) {
          console.error(`[${requestId}] Error deleting temporary file: ${outputPath}`, error)
        }
      })

    return response
  } catch (error) {
    console.error(`[${requestId}] Error downloading MP3:`, error)
    
    // Check if error is memory-related
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase()
      if (errorMessage.includes("memory") || errorMessage.includes("allocation") || errorMessage.includes("heap")) {
        console.error(`[${requestId}] Memory-related error detected:`, error)
        logMemoryUsage(`[${requestId}] Memory error`)
      }
    }

    // Cast videoId to string explicitly in a way TypeScript will recognize
    return fallbackDownload(videoId as unknown as string, title, artist, requestId)
  }
}

// Fallback download method using an external service
// We know videoId has already been validated and is not null
async function fallbackDownload(videoId: string, title: string, artist: string, requestId: string) {
  try {
    console.log(`[${requestId}] Using fallback download method for video ID: ${videoId}`)
    logMemoryUsage(`[${requestId}] Fallback download`)

    // Create a sanitized filename
    const sanitizedFilename = `${title.replace(/[^a-z0-9]/gi, "_")}${
      artist ? "_" + artist.replace(/[^a-z0-9]/gi, "_") : ""
    }.mp3`

    // Redirect to a direct download service that works reliably
    // This is a last resort if our own download fails
    const downloadUrl = `https://api.vevioz.com/api/button/mp3/${videoId}`

    console.log(`[${requestId}] Redirecting to fallback service: ${downloadUrl}`)
    return NextResponse.redirect(downloadUrl)
  } catch (fallbackError) {
    console.error(`[${requestId}] Fallback download also failed:`, fallbackError)
    return NextResponse.json(
      {
        error: "Failed to download MP3",
        details: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
      },
      { status: 500 },
    )
  }
}
