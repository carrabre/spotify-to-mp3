import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import os from "os"
import { exec } from "child_process"
import YTDlpWrap from "yt-dlp-wrap"
import ffmpegStatic from "ffmpeg-static"

// Helper to run a command and get output
const runCommand = (command: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error)
        return
      }
      resolve(stdout.trim())
    })
  })
}

export async function GET() {
  try {
    // Get system information
    const systemInfo = {
      platform: process.platform,
      architecture: process.arch,
      nodeVersion: process.version,
      currentDirectory: process.cwd(),
      tempDir: os.tmpdir(),
      homeDir: os.homedir(),
      vercelEnv: process.env.VERCEL_ENV || "not set",
      vercelRegion: process.env.VERCEL_REGION || "not set",
      pathEnv: process.env.PATH || "not set",
      ffmpegPath: process.env.FFMPEG_PATH || ffmpegStatic || "not set",
    }

    // Check for yt-dlp
    const ytDlpInfo = {
      detected: false,
      paths: [] as string[],
      version: "Not found",
    }

    // Try to find yt-dlp in various locations
    const possibleYtdlpLocations = ["./.vercel/bin/yt-dlp", "/tmp/yt-dlp", "/var/task/yt-dlp", "/opt/bin/yt-dlp"]

    // Also look in PATH
    if (process.env.PATH) {
      const pathDirs = process.env.PATH.split(path.delimiter)
      for (const dir of pathDirs) {
        possibleYtdlpLocations.push(path.join(dir, "yt-dlp"))
      }
    }

    // Check each location
    for (const loc of possibleYtdlpLocations) {
      if (fs.existsSync(loc)) {
        ytDlpInfo.detected = true
        ytDlpInfo.paths.push(loc)

        try {
          // Try to get version
          const ytDlp = new YTDlpWrap(loc)
          ytDlpInfo.version = await ytDlp.getVersion()
        } catch (e) {
          console.error(`Error getting yt-dlp version from ${loc}:`, e)
        }
      }
    }

    // Try using which command
    try {
      const whichOutput = await runCommand("which yt-dlp")
      if (whichOutput && !ytDlpInfo.paths.includes(whichOutput)) {
        ytDlpInfo.paths.push(whichOutput)
        if (!ytDlpInfo.detected) {
          ytDlpInfo.detected = true
        }
      }
    } catch (e) {
      console.log("which command failed:", e)
    }

    // Check for ffmpeg
    const ffmpegInfo = {
      detected: false,
      staticPath: ffmpegStatic || "not installed",
      envPath: process.env.FFMPEG_PATH || "not set",
      version: "Not found",
    }

    if (ffmpegStatic) {
      ffmpegInfo.detected = true
      try {
        const ffmpegVersion = await runCommand(`${ffmpegStatic} -version`).catch(() => "Error getting version")
        ffmpegInfo.version = ffmpegVersion.split("\n")[0]
      } catch (e) {
        console.error("Error getting ffmpeg version:", e)
      }
    }

    // Check if we can create and write to the temp directory
    const tempDirTest = {
      canCreate: false,
      canWrite: false,
      canDelete: false,
      error: null as string | null,
    }

    try {
      const testDir = path.join(os.tmpdir(), "spotify-to-mp3-test")
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true })
      }
      tempDirTest.canCreate = true

      const testFile = path.join(testDir, "test.txt")
      fs.writeFileSync(testFile, "Test content")
      tempDirTest.canWrite = true

      fs.unlinkSync(testFile)
      fs.rmdirSync(testDir)
      tempDirTest.canDelete = true
    } catch (e) {
      tempDirTest.error = e instanceof Error ? e.message : String(e)
    }

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      system: systemInfo,
      ytdlp: ytDlpInfo,
      ffmpeg: ffmpegInfo,
      tempDir: tempDirTest,
    })
  } catch (error) {
    console.error("Error in diagnostics:", error)
    return NextResponse.json(
      {
        error: "Failed to run diagnostics",
        details: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 },
    )
  }
}
