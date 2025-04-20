// app/api/mp3-transcode/route.ts
import { type NextRequest, NextResponse } from "next/server"
// @ts-ignore - s-ytdl doesn't have type definitions
import SYTDL from "s-ytdl"
import fetch from "node-fetch"
import ffmpegStatic from "ffmpeg-static"
import { execFile, spawn } from "child_process"
import fs from "fs"
import os from "os"
import path from "path"

// Add type declaration for external APIs
interface ApiResponse {
  success: boolean;
  data?: {
    url: string;
    [key: string]: any;
  };
  [key: string]: any;
}

interface AlternativeApiResponse {
  status: string;
  link?: string;
  [key: string]: any;
}

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get("videoId")
  const title = req.nextUrl.searchParams.get("title") || "track"
  const artist = req.nextUrl.searchParams.get("artist") || ""
  const requestId = Date.now().toString()

  console.log(`[mp3-transcode][${requestId}] Starting download for videoId: ${videoId}`)

  if (!videoId) {
    console.error(`[mp3-transcode][${requestId}] Error: No videoId provided`)
    return NextResponse.json({ error: "Missing videoId" }, { status: 400 })
  }

  try {
    // Create a sanitized filename
    const sanitizedFilename = `${title.replace(/[^a-z0-9]/gi, "_")}${
      artist ? "_" + artist.replace(/[^a-z0-9]/gi, "_") : ""
    }.mp3`

    // Create temp directory
    const tempDir = path.join(os.tmpdir(), "mp3-transcode")
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }

    const outFile = path.join(tempDir, `${requestId}_${sanitizedFilename}`)

    // Try different download methods in sequence
    // Method 1: Using s-ytdl (lightweight YouTube downloader)
    try {
      console.log(`[mp3-transcode][${requestId}] Trying Method 1: s-ytdl`)
      
      // 1) Download audio using s-ytdl
      const audioBuffer = await SYTDL.dl(`https://www.youtube.com/watch?v=${videoId}`, "4", "audio")
      console.log(`[mp3-transcode][${requestId}] Download complete, buffer size: ${audioBuffer.length} bytes`)

      // Write to temp file
      const inFile = path.join(tempDir, `${requestId}_input.webm`)
      fs.writeFileSync(inFile, audioBuffer)
      console.log(`[mp3-transcode][${requestId}] Wrote input file: ${inFile}`)

      // 2) Transcode to MP3 with FFmpeg
      console.log(`[mp3-transcode][${requestId}] Starting FFmpeg transcoding`)
      
      await new Promise<void>((resolve, reject) => {
        execFile(
          ffmpegStatic!,
          [
            "-i",
            inFile,
            "-codec:a",
            "libmp3lame",
            "-qscale:a",
            "2",
            "-write_xing",
            "1",
            "-id3v2_version",
            "3",
            "-metadata",
            `title=${title}`,
            "-metadata",
            `artist=${artist}`,
            outFile,
          ],
          (error, stdout, stderr) => {
            console.log(`[mp3-transcode][${requestId}] FFmpeg stdout:`, stdout)
            console.log(`[mp3-transcode][${requestId}] FFmpeg stderr:`, stderr)

            if (error) {
              console.error(`[mp3-transcode][${requestId}] FFmpeg error:`, error)
              reject(new Error(stderr))
              return
            }

            resolve()
          },
        )
      })

      // 3) Verify the output file exists and has content
      if (!fs.existsSync(outFile)) {
        throw new Error(`Output file does not exist: ${outFile}`)
      }

      const fileStats = fs.statSync(outFile)
      console.log(`[mp3-transcode][${requestId}] Output file size: ${fileStats.size} bytes`)

      if (fileStats.size === 0) {
        throw new Error("Output file is empty")
      }

      // 4) Read the file and prepare to send it
      const mp3Data = fs.readFileSync(outFile)
      console.log(`[mp3-transcode][${requestId}] Read ${mp3Data.length} bytes from output file`)

      // 5) Clean up temp files
      try {
        fs.unlinkSync(path.join(tempDir, `${requestId}_input.webm`))
        fs.unlinkSync(outFile)
        console.log(`[mp3-transcode][${requestId}] Cleaned up temp files`)
      } catch (cleanupError) {
        console.error(`[mp3-transcode][${requestId}] Error cleaning up temp files:`, cleanupError)
      }

      // 6) Return the MP3 data with proper headers
      console.log(`[mp3-transcode][${requestId}] Sending MP3 response with size: ${mp3Data.length} bytes`)

      // IMPORTANT: Set the correct headers to ensure the browser treats this as a download
      const headers = new Headers()
      headers.set("Content-Type", "audio/mpeg")
      headers.set("Content-Disposition", `attachment; filename="${sanitizedFilename}"`)
      headers.set("Content-Length", mp3Data.length.toString())
      headers.set("Cache-Control", "no-store, no-cache")

      // Return the binary data directly
      return new NextResponse(mp3Data, {
        status: 200,
        headers,
      })
    } catch (method1Error) {
      console.error(`[mp3-transcode][${requestId}] Method 1 failed:`, method1Error)
      
      // Method 2: Try using a public API service (free tier of a YouTube to MP3 API)
      try {
        console.log(`[mp3-transcode][${requestId}] Trying Method 2: External API service`)
        
        // Use a reliable public API that returns direct MP3 data
        // This is more reliable for the deployed environment
        const apiUrl = `https://converter-api-nine.vercel.app/api/convert?url=https://www.youtube.com/watch?v=${videoId}`
        
        const apiResponse = await fetch(apiUrl)
        
        if (!apiResponse.ok) {
          throw new Error(`API responded with status ${apiResponse.status}`)
        }
        
        const apiResult = await apiResponse.json() as ApiResponse
        
        if (!apiResult.success || !apiResult.data || !apiResult.data.url) {
          throw new Error('API returned invalid response format')
        }
        
        // Download from the provided URL
        const mp3Response = await fetch(apiResult.data.url)
        
        if (!mp3Response.ok) {
          throw new Error(`MP3 download failed with status ${mp3Response.status}`)
        }
        
        // Get the audio data
        const mp3Buffer = await mp3Response.buffer()
        
        if (mp3Buffer.length < 10000) {
          throw new Error('Downloaded file is suspiciously small')
        }
        
        console.log(`[mp3-transcode][${requestId}] External API method successful, file size: ${mp3Buffer.length} bytes`)
        
        // Return the MP3 data
        const headers = new Headers()
        headers.set("Content-Type", "audio/mpeg")
        headers.set("Content-Disposition", `attachment; filename="${sanitizedFilename}"`)
        headers.set("Content-Length", mp3Buffer.length.toString())
        headers.set("Cache-Control", "no-store, no-cache")
        
        return new NextResponse(mp3Buffer, {
          status: 200,
          headers,
        })
      } catch (method2Error) {
        console.error(`[mp3-transcode][${requestId}] Method 2 failed:`, method2Error)
        
        // Method 3: Try using a different API service
        try {
          console.log(`[mp3-transcode][${requestId}] Trying Method 3: Alternative API service`)
          
          // Use another reliable API (different provider)
          const alternativeApiUrl = `https://youtube-mp36.p.rapidapi.com/dl?id=${videoId}`
          
          const alternativeApiResponse = await fetch(alternativeApiUrl, {
            headers: {
              'X-RapidAPI-Key': process.env.RAPID_API_KEY || '',
              'X-RapidAPI-Host': 'youtube-mp36.p.rapidapi.com'
            }
          })
          
          if (!alternativeApiResponse.ok) {
            throw new Error(`Alternative API responded with status ${alternativeApiResponse.status}`)
          }
          
          const alternativeApiResult = await alternativeApiResponse.json() as AlternativeApiResponse
          
          if (alternativeApiResult.status === 'ok' && alternativeApiResult.link) {
            // Redirect to the download URL - client will handle this
            return NextResponse.redirect(alternativeApiResult.link)
          } else {
            throw new Error('Alternative API returned invalid response')
          }
        } catch (method3Error) {
          console.error(`[mp3-transcode][${requestId}] Method 3 failed:`, method3Error)
          
          // All methods failed, return comprehensive error information
          return NextResponse.json({
            error: "All download methods failed",
            message: "The server was unable to download this track. Please use the external download options.",
            details: {
              method1Error: method1Error instanceof Error ? method1Error.message : String(method1Error),
              method2Error: method2Error instanceof Error ? method2Error.message : String(method2Error),
              method3Error: method3Error instanceof Error ? method3Error.message : String(method3Error)
            }
          }, { status: 500 })
        }
      }
    }
  } catch (generalError) {
    console.error(`[mp3-transcode][${requestId}] General error:`, generalError)

    // Return an error response with comprehensive details
    return NextResponse.json({
      error: "Download failed",
      message: "The download process encountered an error. Please try alternative download options.",
      details: generalError instanceof Error ? generalError.message : String(generalError),
    }, { status: 500 })
  }
}
