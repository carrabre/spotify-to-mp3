import { type NextRequest, NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import os from "os"
import { spawn } from "child_process"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const videoId = searchParams.get("videoId")
  const title = searchParams.get("title") || "track"
  const artist = searchParams.get("artist") || ""

  if (!videoId) {
    return NextResponse.json({ error: "Video ID is required" }, { status: 400 })
  }

  try {
    console.log(`Starting direct MP3 download for video ID: ${videoId}`)

    // YouTube URL from video ID
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`

    // Create a sanitized filename
    const sanitizedFilename = `${title.replace(/[^a-z0-9]/gi, "_")}${
      artist ? "_" + artist.replace(/[^a-z0-9]/gi, "_") : ""
    }.mp3`

    // Create a temporary directory for downloads
    const tempDir = path.join(os.tmpdir(), "spotify-to-mp3-direct")

    // Ensure the directory exists
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }

    // Create a temporary file path
    const tempFilePath = path.join(tempDir, `${Date.now()}_${sanitizedFilename}`)

    console.log(`Downloading to temporary file: ${tempFilePath}`)

    // Download the audio using yt-dlp directly
    const ytDlpProcess = spawn("yt-dlp", [
      youtubeUrl,
      "-f",
      "bestaudio",
      "-x",
      "--audio-format",
      "mp3",
      "--audio-quality",
      "0",
      "-o",
      tempFilePath,
      "--no-playlist",
      "--no-warnings",
      "--verbose",
    ])

    // Collect stdout for debugging
    let stdoutData = ""
    ytDlpProcess.stdout.on("data", (data) => {
      stdoutData += data.toString()
      console.log(`yt-dlp stdout: ${data}`)
    })

    // Collect stderr for debugging
    let stderrData = ""
    ytDlpProcess.stderr.on("data", (data) => {
      stderrData += data.toString()
      console.error(`yt-dlp stderr: ${data}`)
    })

    // Wait for the process to complete
    const exitCode = await new Promise((resolve) => {
      ytDlpProcess.on("close", resolve)
    })

    console.log(`yt-dlp process exited with code ${exitCode}`)

    if (exitCode !== 0) {
      throw new Error(`yt-dlp process failed with exit code ${exitCode}. stderr: ${stderrData}`)
    }

    // Check if the file exists and has content
    if (!fs.existsSync(tempFilePath)) {
      throw new Error(`Downloaded file does not exist at ${tempFilePath}`)
    }

    const fileSize = fs.statSync(tempFilePath).size
    console.log(`Downloaded file size: ${fileSize} bytes`)

    if (fileSize === 0) {
      throw new Error("Downloaded file is empty")
    }

    // Read the file
    const fileBuffer = fs.readFileSync(tempFilePath)

    // Clean up the temporary file
    try {
      fs.unlinkSync(tempFilePath)
    } catch (unlinkError) {
      console.error(`Error deleting temporary file ${tempFilePath}:`, unlinkError)
    }

    // Set headers for file download
    const headers = new Headers()
    headers.set("Content-Disposition", `attachment; filename="${sanitizedFilename}"`)
    headers.set("Content-Type", "audio/mpeg")
    headers.set("Content-Length", fileSize.toString())

    return new NextResponse(fileBuffer, {
      status: 200,
      headers,
    })
  } catch (error) {
    console.error("Error in direct MP3 download:", error)

    // Try fallback method if yt-dlp fails
    try {
      console.log("Attempting fallback download method...")
      return await streamYouTubeAudio(videoId, title, artist)
    } catch (fallbackError) {
      console.error("Fallback download method also failed:", fallbackError)

      return NextResponse.json(
        {
          error: "Failed to download MP3",
          details: error instanceof Error ? error.message : String(error),
          fallbackError: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
        },
        { status: 500 },
      )
    }
  }
}

// Fallback method: Stream YouTube audio directly
async function streamYouTubeAudio(videoId: string, title: string, artist: string) {
  console.log(`Starting fallback streaming for video ID: ${videoId}`)

  // YouTube URL from video ID
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`

  // Create a sanitized filename
  const sanitizedFilename = `${title.replace(/[^a-z0-9]/gi, "_")}${
    artist ? "_" + artist.replace(/[^a-z0-9]/gi, "_") : ""
  }.mp3`

  try {
    // First, get the audio URL using yt-dlp
    const getUrlProcess = spawn("yt-dlp", [
      youtubeUrl,
      "-f",
      "bestaudio",
      "-g", // Print the URL only
      "--no-playlist",
      "--no-warnings",
    ])

    let audioUrl = ""
    getUrlProcess.stdout.on("data", (data) => {
      audioUrl += data.toString().trim()
    })

    // Wait for the process to complete
    const exitCode = await new Promise((resolve) => {
      getUrlProcess.on("close", resolve)
    })

    if (exitCode !== 0 || !audioUrl) {
      throw new Error("Failed to get audio URL")
    }

    console.log(`Got audio URL: ${audioUrl.substring(0, 50)}...`)

    // Create a temporary directory for downloads
    const tempDir = path.join(os.tmpdir(), "spotify-to-mp3-stream")

    // Ensure the directory exists
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }

    // Create a temporary file path
    const tempFilePath = path.join(tempDir, `${Date.now()}_${sanitizedFilename}`)

    // Use ffmpeg to download and convert the audio
    const ffmpegProcess = spawn("ffmpeg", [
      "-i",
      audioUrl,
      "-c:a",
      "libmp3lame",
      "-q:a",
      "0",
      "-metadata",
      `title=${title}`,
      "-metadata",
      `artist=${artist}`,
      tempFilePath,
    ])

    // Wait for the process to complete
    const ffmpegExitCode = await new Promise((resolve) => {
      ffmpegProcess.on("close", resolve)
    })

    if (ffmpegExitCode !== 0) {
      throw new Error(`ffmpeg process failed with exit code ${ffmpegExitCode}`)
    }

    // Check if the file exists and has content
    if (!fs.existsSync(tempFilePath)) {
      throw new Error(`Converted file does not exist at ${tempFilePath}`)
    }

    const fileSize = fs.statSync(tempFilePath).size
    console.log(`Converted file size: ${fileSize} bytes`)

    if (fileSize === 0) {
      throw new Error("Converted file is empty")
    }

    // Read the file
    const fileBuffer = fs.readFileSync(tempFilePath)

    // Clean up the temporary file
    try {
      fs.unlinkSync(tempFilePath)
    } catch (unlinkError) {
      console.error(`Error deleting temporary file ${tempFilePath}:`, unlinkError)
    }

    // Set headers for file download
    const headers = new Headers()
    headers.set("Content-Disposition", `attachment; filename="${sanitizedFilename}"`)
    headers.set("Content-Type", "audio/mpeg")
    headers.set("Content-Length", fileSize.toString())

    return new NextResponse(fileBuffer, {
      status: 200,
      headers,
    })
  } catch (error) {
    console.error("Error in streaming fallback:", error)
    throw error
  }
}
