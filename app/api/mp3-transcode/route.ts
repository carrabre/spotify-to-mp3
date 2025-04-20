// app/api/mp3-transcode/route.ts
import { type NextRequest, NextResponse } from "next/server"
import SYTDL from "s-ytdl"
import ffmpegStatic from "ffmpeg-static"
import { execFile } from "child_process"
import fs from "fs"
import os from "os"
import path from "path"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Helper to check if we're on Vercel
const isVercelProd = process.env.VERCEL_ENV === 'production'
const isVercelEnvironment = !!process.env.VERCEL

export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get("videoId")
  const title = req.nextUrl.searchParams.get("title") || "track"
  const artist = req.nextUrl.searchParams.get("artist") || ""
  const requestId = Date.now().toString()

  console.log(`[mp3-transcode][${requestId}] Starting download for videoId: ${videoId}`)
  console.log(`[mp3-transcode][${requestId}] Environment: Vercel=${isVercelEnvironment}, Prod=${isVercelProd}`)
  console.log(`[mp3-transcode][${requestId}] FFmpeg path: ${ffmpegStatic}`)
  console.log(`[mp3-transcode][${requestId}] System info:`, {
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    tempDir: os.tmpdir(),
    freeMem: os.freemem(),
    totalMem: os.totalmem()
  })

  if (!videoId) {
    console.error(`[mp3-transcode][${requestId}] Error: No videoId provided`)
    return NextResponse.json({ error: "Missing videoId" }, { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
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
    console.log(`[mp3-transcode][${requestId}] Output file will be: ${outFile}`)

    // Track whether we're using the simpler method without FFmpeg
    let usedSimpleMethod = false

    // Try downloading with our direct downloader first
    console.log(`[mp3-transcode][${requestId}] Attempting direct downloader...`)
    let audioBuffer: Buffer;
    
    try {
      // Import and use the direct downloader
      const { downloadWithFallback } = await import('@/lib/direct-downloader')
      const result = await downloadWithFallback(videoId);
      audioBuffer = result.buffer;
      console.log(`[mp3-transcode][${requestId}] Direct download complete, size: ${audioBuffer.length} bytes`);
      
      // If the format isn't MP3 and FFmpeg is available, we'll transcode it
      const needsTranscoding = !result.mimeType.includes('mp3') && ffmpegStatic;
      
      if (!needsTranscoding) {
        console.log(`[mp3-transcode][${requestId}] No transcoding needed, using direct audio data`);
        usedSimpleMethod = true;
      } else {
        // We need to transcode the audio
        const inFile = path.join(tempDir, `${requestId}_input.webm`);
        fs.writeFileSync(inFile, audioBuffer);
        console.log(`[mp3-transcode][${requestId}] Wrote input file: ${inFile}`);
        
        // Continue with FFmpeg transcoding...
        await transcodeWithFFmpeg(inFile, outFile, title, artist, requestId);
        
        // Read the transcoded file
        audioBuffer = fs.readFileSync(outFile);
        console.log(`[mp3-transcode][${requestId}] Read ${audioBuffer.length} bytes from transcoded file`);
        
        // Clean up temp files
        try {
          fs.unlinkSync(inFile);
          fs.unlinkSync(outFile);
          console.log(`[mp3-transcode][${requestId}] Cleaned up temp files`);
        } catch (cleanupError) {
          console.error(`[mp3-transcode][${requestId}] Error cleaning up temp files:`, cleanupError);
        }
      }
    } catch (directError) {
      console.error(`[mp3-transcode][${requestId}] Direct downloader failed:`, directError);
      
      // Fall back to s-ytdl as a last resort
      try {
        console.log(`[mp3-transcode][${requestId}] Falling back to s-ytdl...`);
        audioBuffer = await SYTDL.dl(`https://www.youtube.com/watch?v=${videoId}`, "4", "audio");
        console.log(`[mp3-transcode][${requestId}] s-ytdl download complete, size: ${audioBuffer.length} bytes`);
        
        // Check if FFmpeg is available
        if (!ffmpegStatic && isVercelEnvironment) {
          console.warn(`[mp3-transcode][${requestId}] FFmpeg not available in this environment, using direct audio data`);
          usedSimpleMethod = true;
        } else {
          // Write to temp file
          const inFile = path.join(tempDir, `${requestId}_input.webm`);
          fs.writeFileSync(inFile, audioBuffer);
          console.log(`[mp3-transcode][${requestId}] Wrote input file: ${inFile}`);
          
          // Transcode with FFmpeg
          await transcodeWithFFmpeg(inFile, outFile, title, artist, requestId);
          
          // Read the transcoded file
          audioBuffer = fs.readFileSync(outFile);
          console.log(`[mp3-transcode][${requestId}] Read ${audioBuffer.length} bytes from transcoded file`);
          
          // Clean up temp files
          try {
            fs.unlinkSync(inFile);
            fs.unlinkSync(outFile);
            console.log(`[mp3-transcode][${requestId}] Cleaned up temp files`);
          } catch (cleanupError) {
            console.error(`[mp3-transcode][${requestId}] Error cleaning up temp files:`, cleanupError);
          }
        }
      } catch (sytdlError: any) {
        // Check for DNS errors
        if (sytdlError.message && (
          sytdlError.message.includes('ENOTFOUND') || 
          sytdlError.message.includes('getaddrinfo')
        )) {
          console.error(`[mp3-transcode][${requestId}] DNS resolution error in s-ytdl:`, sytdlError);
          throw new Error('Unable to resolve domains needed for download. Please try the alternative download options.');
        }
        
        // Not a DNS error, rethrow
        throw sytdlError;
      }
    }

    // Return the audio data with proper headers
    console.log(`[mp3-transcode][${requestId}] Sending audio response with size: ${audioBuffer.length} bytes, method: ${usedSimpleMethod ? 'direct' : 'transcoded'}`);

    // IMPORTANT: Set the correct headers to ensure the browser treats this as a download
    const headers = new Headers()
    headers.set("Content-Type", usedSimpleMethod ? "audio/webm" : "audio/mpeg")
    headers.set("Content-Disposition", `attachment; filename="${sanitizedFilename}"`)
    headers.set("Content-Length", audioBuffer.length.toString())
    headers.set("Cache-Control", "no-store, no-cache")

    console.log(`[mp3-transcode][${requestId}] Response headers:`, {
      contentType: headers.get("Content-Type"),
      contentDisposition: headers.get("Content-Disposition"),
      contentLength: headers.get("Content-Length")
    })

    // Return the binary data directly
    return new NextResponse(audioBuffer, {
      status: 200,
      headers,
    })
  } catch (error) {
    console.error(`[mp3-transcode][${requestId}] Error:`, error);

    // Return an error response with explicit content type
    return NextResponse.json({
      error: "Download failed",
      message: error instanceof Error ? 
        (error.message.includes('403') || error.message.includes('forbidden') 
          ? 'YouTube is blocking this download. Please try again or use the alternative download options.' 
          : error.message) 
        : "The download process encountered an error. Please try alternative download options.",
      details: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    }, { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

// Helper function to transcode with FFmpeg
async function transcodeWithFFmpeg(inFile: string, outFile: string, title: string, artist: string, requestId: string): Promise<void> {
  console.log(`[mp3-transcode][${requestId}] Starting FFmpeg transcoding`);
  
  return new Promise<void>((resolve, reject) => {
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
        console.log(`[mp3-transcode][${requestId}] FFmpeg stdout:`, stdout);
        console.log(`[mp3-transcode][${requestId}] FFmpeg stderr:`, stderr);

        if (error) {
          console.error(`[mp3-transcode][${requestId}] FFmpeg error:`, error);
          reject(new Error(stderr));
          return;
        }

        resolve();
      },
    );
  });
  
  // Verify the output file exists and has content
  if (!fs.existsSync(outFile)) {
    throw new Error(`Output file does not exist: ${outFile}`);
  }

  const fileStats = fs.statSync(outFile);
  console.log(`[mp3-transcode][${requestId}] Output file size: ${fileStats.size} bytes`);

  if (fileStats.size === 0) {
    throw new Error("Output file is empty");
  }
}
