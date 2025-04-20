export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import ffmpegStatic from "ffmpeg-static"
import fs from "fs"
import { spawn } from "child_process"

export async function GET() {
  const requestId = Date.now().toString()
  console.log(`[test-mp3][${requestId}] Starting test`)

  try {
    // Check if ffmpeg-static is available and executable
    console.log(`[test-mp3][${requestId}] FFmpeg binary path: ${ffmpegStatic}`)

    let ffmpegInfo: string | { 
      path: string; 
      exists?: boolean; 
      isExecutable?: boolean; 
      size?: number;
      version?: string;
      error?: string;
    } = "Not available"
    
    if (ffmpegStatic) {
      try {
        const stats = fs.statSync(ffmpegStatic)
        const isExecutable = !!(stats.mode & fs.constants.S_IXUSR)
        ffmpegInfo = {
          path: ffmpegStatic,
          exists: true,
          isExecutable,
          size: stats.size,
        }

        // Try to get FFmpeg version
        const ffmpeg = spawn(ffmpegStatic, ["-version"])
        let version = ""
        ffmpeg.stdout.on("data", (data) => {
          version += data.toString().split("\n")[0]
        })

        await new Promise((resolve) => {
          ffmpeg.on("close", (code) => {
            console.log(`[test-mp3][${requestId}] FFmpeg version check exited with code ${code}`)
            resolve(code)
          })
        })

        ffmpegInfo.version = version
      } catch (error) {
        ffmpegInfo = {
          path: ffmpegStatic,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }

    // Check environment variables
    const envInfo = {
      PATH: process.env.PATH ? "Set" : "Not set",
      PATH_LENGTH: process.env.PATH?.length || 0,
      FFMPEG_PATH: process.env.FFMPEG_PATH || "Not set",
      NODE_ENV: process.env.NODE_ENV,
      VERCEL_ENV: process.env.VERCEL_ENV,
      VERCEL_REGION: process.env.VERCEL_REGION,
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ffmpeg: ffmpegInfo,
      environment: envInfo,
      message: "Test completed successfully",
    })
  } catch (error) {
    console.error(`[test-mp3][${requestId}] Test failed:`, error)

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 },
    )
  }
}
