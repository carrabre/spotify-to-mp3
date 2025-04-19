import { NextResponse } from "next/server"
import { spawn } from "child_process"
import fs from "fs"
import path from "path"
import os from "os"

export async function GET() {
  const results = {
    ytdlp: await checkYtDlp(),
    ffmpeg: await checkFfmpeg(),
    system: getSystemInfo(),
    environment: getEnvironmentInfo(),
  }

  return NextResponse.json(results)
}

async function checkYtDlp() {
  try {
    // Check if yt-dlp is installed
    const versionProcess = spawn("yt-dlp", ["--version"])

    let version = ""
    versionProcess.stdout.on("data", (data) => {
      version += data.toString().trim()
    })

    // Wait for the process to complete
    const exitCode = await new Promise((resolve) => {
      versionProcess.on("close", resolve)
    })

    if (exitCode !== 0) {
      return {
        installed: false,
        version: null,
        error: `yt-dlp exited with code ${exitCode}`,
      }
    }

    // Test a simple download
    const testResult = await testYtDlpDownload()

    return {
      installed: true,
      version,
      testResult,
    }
  } catch (error) {
    return {
      installed: false,
      version: null,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function testYtDlpDownload() {
  try {
    // Create a temporary directory for testing
    const tempDir = path.join(os.tmpdir(), "spotify-to-mp3-test")

    // Ensure the directory exists
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }

    // Create a temporary file path
    const tempFilePath = path.join(tempDir, `test_${Date.now()}.mp3`)

    // Download a short test video
    const downloadProcess = spawn("yt-dlp", [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ", // Rick Astley - Never Gonna Give You Up
      "-f",
      "bestaudio[filesize<10M]", // Limit file size for testing
      "-x",
      "--audio-format",
      "mp3",
      "--audio-quality",
      "0",
      "-o",
      tempFilePath,
      "--max-filesize",
      "5M", // Limit to 5MB for testing
      "--no-playlist",
      "--no-warnings",
    ])

    // Wait for the process to complete
    const exitCode = await new Promise((resolve) => {
      downloadProcess.on("close", resolve)
    })

    if (exitCode !== 0) {
      return {
        success: false,
        error: `Download process exited with code ${exitCode}`,
      }
    }

    // Check if the file exists and has content
    if (!fs.existsSync(tempFilePath)) {
      return {
        success: false,
        error: "Downloaded file does not exist",
      }
    }

    const fileSize = fs.statSync(tempFilePath).size

    // Clean up the temporary file
    try {
      fs.unlinkSync(tempFilePath)
    } catch (unlinkError) {
      console.error(`Error deleting temporary file ${tempFilePath}:`, unlinkError)
    }

    return {
      success: true,
      fileSize,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function checkFfmpeg() {
  try {
    // Check if ffmpeg is installed
    const versionProcess = spawn("ffmpeg", ["-version"])

    let version = ""
    versionProcess.stdout.on("data", (data) => {
      // Just get the first line which contains the version
      if (!version) {
        version = data.toString().split("\n")[0].trim()
      }
    })

    // Wait for the process to complete
    const exitCode = await new Promise((resolve) => {
      versionProcess.on("close", resolve)
    })

    if (exitCode !== 0) {
      return {
        installed: false,
        version: null,
        error: `ffmpeg exited with code ${exitCode}`,
      }
    }

    return {
      installed: true,
      version,
    }
  } catch (error) {
    return {
      installed: false,
      version: null,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function getSystemInfo() {
  return {
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    tempDir: os.tmpdir(),
    freeMem: os.freemem(),
    totalMem: os.totalmem(),
    cpus: os.cpus().length,
  }
}

function getEnvironmentInfo() {
  // Get relevant environment variables (without exposing secrets)
  return {
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_REGION: process.env.VERCEL_REGION,
    PATH: process.env.PATH?.split(path.delimiter).join("\n"),
  }
}
