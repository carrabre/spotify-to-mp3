import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Get yt-dlp path from environment or use default
const YT_DLP_PATH = process.env.YT_DLP_PATH || '/opt/homebrew/bin/yt-dlp'

export async function GET(req: NextRequest) {
  const startTime = Date.now()
  const videoId = req.nextUrl.searchParams.get('videoId')
  if (!videoId) {
    return NextResponse.json({ error: 'Missing videoId' }, { status: 400 })
  }

  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`
  const tempFile = path.join(os.tmpdir(), `${videoId}-${Date.now()}.mp3`)

  console.log(`[Transcode][${videoId}] Starting transcode process at ${new Date().toISOString()}`)
  console.log(`[Transcode][${videoId}] System info:`, {
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    tempDir: os.tmpdir(),
    freeMem: os.freemem(),
    totalMem: os.totalmem(),
    ytDlpPath: YT_DLP_PATH,
    ytDlpExists: fs.existsSync(YT_DLP_PATH)
  })
  console.log(`[Transcode][${videoId}] videoUrl: ${videoUrl}`)
  console.log(`[Transcode][${videoId}] tempFile: ${tempFile}`)

  try {
    console.log(`[Transcode][${videoId}] Starting yt-dlp download...`)
    
    // Check if yt-dlp exists
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

    // Collect stdout for debugging
    let stdoutData = ''
    ytDlpProcess.stdout.on('data', (data) => {
      stdoutData += data.toString()
      console.log(`[Transcode][${videoId}] yt-dlp stdout: ${data}`)
    })

    // Collect stderr for debugging
    let stderrData = ''
    ytDlpProcess.stderr.on('data', (data) => {
      stderrData += data.toString()
      console.error(`[Transcode][${videoId}] yt-dlp stderr: ${data}`)
    })

    // Wait for the process to complete
    const exitCode = await new Promise<number>((resolve) => {
      ytDlpProcess.on('close', resolve)
    })

    console.log(`[Transcode][${videoId}] yt-dlp process exited with code ${exitCode}`)

    if (exitCode !== 0) {
      throw new Error(`yt-dlp process failed with exit code ${exitCode}. stderr: ${stderrData}`)
    }

    // Verify the file exists and get its stats
    if (!fs.existsSync(tempFile)) {
      throw new Error(`Output file does not exist at ${tempFile}`)
    }

    const stats = fs.statSync(tempFile)
    console.log(`[Transcode][${videoId}] Output file stats:`, {
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime
    })

    if (stats.size === 0) {
      throw new Error('Output file is empty')
    }

    // Read and return the file
    const data = fs.readFileSync(tempFile)
    console.log(`[Transcode][${videoId}] Read ${data.length} bytes from output file`)

    const duration = Date.now() - startTime
    console.log(`[Transcode][${videoId}] Complete! Duration: ${duration}ms`)

    // Clean up the temp file
    try {
      fs.unlinkSync(tempFile)
      console.log(`[Transcode][${videoId}] Successfully deleted temp file: ${tempFile}`)
    } catch (unlinkError) {
      console.error(`[Transcode][${videoId}] Error deleting temp file:`, {
        path: tempFile,
        error: unlinkError instanceof Error ? unlinkError.message : String(unlinkError),
        code: unlinkError instanceof Error && 'code' in unlinkError ? unlinkError.code : undefined
      })
    }

    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': data.length.toString(),
        'Content-Disposition': `attachment; filename="${videoId}.mp3"`,
      },
    })
  } catch (error) {
    const duration = Date.now() - startTime
    console.error(`[Transcode][${videoId}] Process failed after ${duration}ms:`, {
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : String(error),
      tempFileExists: fs.existsSync(tempFile)
    })

    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: 'Transcode failed', message },
      { status: 500 }
    )
  }
}