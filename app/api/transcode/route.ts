import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { getServerRuntimeConfig } from '@/lib/config'
import { throttle } from '@/lib/utils'
import SYTDL from "s-ytdl"

// Track ongoing requests to prevent overloading the server
let ongoingRequests = 0
const MAX_CONCURRENT = 5 // Maximum concurrent transcoding operations

// Get yt-dlp path from environment or use default
const YT_DLP_PATH = process.env.YT_DLP_PATH || '/opt/homebrew/bin/yt-dlp'

// Configure cache for responses
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Helper to check if we're on Vercel
const isVercelProd = process.env.VERCEL_ENV === 'production'
const isVercelEnvironment = !!process.env.VERCEL

// Handle transcoding requests with optimized resource usage
export async function GET(req: NextRequest) {
  const requestId = Date.now().toString()
  console.log(`[API:transcode][${requestId}] New request received at ${new Date().toISOString()}`)
  
  try {
    const { searchParams } = new URL(req.url)
    const videoId = searchParams.get('videoId')

    console.log(`[API:transcode][${requestId}] Processing videoId: ${videoId}`)
    console.log(`[API:transcode][${requestId}] Environment: Vercel=${isVercelEnvironment}, Prod=${isVercelProd}`)

    if (!videoId) {
      console.error(`[API:transcode][${requestId}] Error: Missing videoId parameter`)
      return NextResponse.json(
        { success: false, message: "Missing 'videoId' parameter" },
        { status: 400 }
      )
    }

    // Check if we're at capacity
    if (ongoingRequests >= MAX_CONCURRENT) {
      console.log(`[API:transcode][${requestId}] At capacity: ${ongoingRequests}/${MAX_CONCURRENT}`)
      return NextResponse.json(
        { 
          success: false, 
          message: "Server is at capacity. Please try again later."
        },
        { 
          status: 503,
          headers: {
            'Retry-After': '10'
          }
        }
      )
    }

    // Increment counter
    ongoingRequests++
    console.log(`[API:transcode][${requestId}] Incremented request counter to ${ongoingRequests}`)
    
    try {
      let audioData;
      
      // First try the optimized transcoder
      try {
        console.log(`[API:transcode][${requestId}] Attempting primary transcode method...`)
        // Import dynamically to reduce cold start time
        const { transcodeYouTubeVideo } = await import('@/lib/transcoder')
        
        // Get server config (throttling settings, etc)
        const config = getServerRuntimeConfig()
        
        // Apply throttling based on server config
        const throttledTranscode = throttle(transcodeYouTubeVideo, config.concurrentRequests || 2)
        
        // Get audio data with proper error handling
        audioData = await throttledTranscode(videoId)
        console.log(`[API:transcode][${requestId}] Primary transcode method succeeded`)
      } catch (primaryError) {
        // If the primary method fails and we're on Vercel, try the fallback method
        console.error(`[API:transcode][${requestId}] Primary transcode failed:`, primaryError)
        
        if (isVercelEnvironment) {
          console.log(`[API:transcode][${requestId}] Attempting fallback s-ytdl method...`)
          
          // Use the s-ytdl method as a fallback
          const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`
          const tempDir = path.join(os.tmpdir(), "fallback-transcode")
          
          if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true })
          }
          
          // Download using s-ytdl
          const audioBuffer = await SYTDL.dl(youtubeUrl, "4", "audio")
          console.log(`[API:transcode][${requestId}] s-ytdl download complete, size: ${audioBuffer.length}`)
          
          // We'll return the audio as-is since it's likely already in a compatible format
          audioData = {
            buffer: audioBuffer,
            size: audioBuffer.length,
            mimeType: 'audio/mpeg' // This might not be accurate, but browsers can usually detect the format
          }
          
          console.log(`[API:transcode][${requestId}] Fallback method succeeded`)
        } else {
          // If not on Vercel, just rethrow the error
          throw primaryError
        }
      }
      
      if (!audioData || !audioData.buffer) {
        throw new Error('Failed to transcode video - no audio data produced')
      }
      
      console.log(`[API:transcode][${requestId}] Returning ${audioData.buffer.length} bytes with Content-Type: ${audioData.mimeType}`)
      
      // Return audio data as MP3
      return new NextResponse(audioData.buffer, {
        headers: {
          'Content-Type': audioData.mimeType,
          'Content-Length': audioData.buffer.length.toString(),
          'Content-Disposition': `attachment; filename="${videoId}.mp3"`,
          'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
        },
      })
    } finally {
      // Always decrement the counter
      ongoingRequests--
      console.log(`[API:transcode][${requestId}] Decremented request counter to ${ongoingRequests}`)
    }
  } catch (error) {
    console.error(`[API:transcode][${requestId}] Unhandled error:`, error)
    
    // Ensure we return proper JSON to avoid HTML responses
    return NextResponse.json(
      { 
        success: false, 
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        timestamp: new Date().toISOString(),
        errorType: error instanceof Error ? error.name : 'Unknown'
      },
      { 
        status: 500,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )
  }
}