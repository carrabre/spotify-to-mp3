import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import os from "os"
import YTDlpWrap from "yt-dlp-wrap"

export async function GET() {
  try {
    // Create a temporary directory for testing
    const tempDir = path.join(os.tmpdir(), "spotify-to-mp3-debug")

    // Ensure the directory exists
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }

    // Initialize yt-dlp-wrap
    const ytDlp = new YTDlpWrap()

    // Get yt-dlp version
    let ytDlpVersion = "Unknown"
    try {
      ytDlpVersion = await ytDlp.getVersion()
    } catch (error) {
      ytDlpVersion = `Error: ${error instanceof Error ? error.message : String(error)}`
    }

    // Get yt-dlp path
    let ytDlpPath = "Unknown"
    try {
      ytDlpPath = await ytDlp.getBinaryPath()
    } catch (error) {
      ytDlpPath = `Error: ${error instanceof Error ? error.message : String(error)}`
    }

    // Try to download a test video
    let downloadTest = "Not attempted"
    let downloadPath = ""
    try {
      // Create a test output path
      downloadPath = path.join(tempDir, "test.mp3")

      // Download a short test video
      await ytDlp.execPromise([
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ", // Rick Astley - Never Gonna Give You Up
        "-f",
        "ba/best",
        "-x",
        "--audio-format",
        "mp3",
        "--audio-quality",
        "0",
        "--output",
        downloadPath,
        "--force-overwrites",
        "--no-playlist",
        "--no-part",
        "--max-filesize",
        "1m", // Limit to 1MB for testing
        "--quiet",
      ])

      // Check if the file exists and has content
      if (fs.existsSync(downloadPath) && fs.statSync(downloadPath).size > 0) {
        downloadTest = "Success"
      } else {
        downloadTest = "Failed: File is empty or does not exist"
      }
    } catch (error) {
      downloadTest = `Error: ${error instanceof Error ? error.message : String(error)}`
    }

    // Get system information
    const systemInfo = {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      tempDir: os.tmpdir(),
      freeMem: os.freemem(),
      totalMem: os.totalmem(),
    }

    // Clean up
    if (fs.existsSync(downloadPath)) {
      try {
        fs.unlinkSync(downloadPath)
      } catch (error) {
        console.error("Error deleting test file:", error)
      }
    }

    return NextResponse.json({
      success: true,
      ytDlp: {
        version: ytDlpVersion,
        path: ytDlpPath,
        downloadTest,
      },
      systemInfo,
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
  }
}
