import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import os from "os"

export async function GET() {
  try {
    // Create a temporary directory for testing
    const tempDir = path.join(os.tmpdir(), "spotify-to-mp3-debug")

    // Ensure the directory exists
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }

    // Create a test file
    const testFilePath = path.join(tempDir, "test.txt")
    fs.writeFileSync(testFilePath, "This is a test file to check if file operations are working correctly.")

    // Check if the file exists
    const fileExists = fs.existsSync(testFilePath)
    const fileSize = fileExists ? fs.statSync(testFilePath).size : 0

    // Get system information
    const systemInfo = {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      tempDir: os.tmpdir(),
      freeMem: os.freemem(),
      totalMem: os.totalmem(),
    }

    // Try to import youtube-dl-exec
    let youtubeDlInfo = "Not available"
    try {
      const youtubeDl = require("youtube-dl-exec")
      youtubeDlInfo = "Available"
    } catch (error) {
      youtubeDlInfo = `Error: ${error instanceof Error ? error.message : String(error)}`
    }

    // Clean up
    if (fileExists) {
      fs.unlinkSync(testFilePath)
    }

    return NextResponse.json({
      success: true,
      fileOperations: {
        tempDir,
        fileCreated: fileExists,
        fileSize,
      },
      systemInfo,
      youtubeDlInfo,
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
  }
}
