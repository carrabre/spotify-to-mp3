import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { getServerRuntimeConfig } from '@/lib/config'
import { throttle } from '@/lib/utils'

// Track ongoing requests to prevent overloading the server
let ongoingRequests = 0
const MAX_CONCURRENT = 5 // Maximum concurrent transcoding operations

// Get yt-dlp path from environment or use default
const YT_DLP_PATH = process.env.YT_DLP_PATH || '/opt/homebrew/bin/yt-dlp'

// Configure cache for responses
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Handle transcoding requests with optimized resource usage
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const videoId = searchParams.get('videoId')

    if (!videoId) {
      return NextResponse.json(
        { success: false, message: "Missing 'videoId' parameter" },
        { status: 400 }
      )
    }

    // Check if we're at capacity
    if (ongoingRequests >= MAX_CONCURRENT) {
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
    
    try {
      // Import dynamically to reduce cold start time
      const { transcodeYouTubeVideo } = await import('@/lib/transcoder')
      
      // Get server config (throttling settings, etc)
      const config = getServerRuntimeConfig()
      
      // Apply throttling based on server config
      const throttledTranscode = throttle(transcodeYouTubeVideo, config.concurrentRequests || 2)
      
      // Get audio data with proper error handling
      const audioData = await throttledTranscode(videoId)
      
      if (!audioData || !audioData.buffer) {
        throw new Error('Failed to transcode video')
      }
      
      // Return audio data as MP3
      return new NextResponse(audioData.buffer, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Length': audioData.buffer.length.toString(),
          'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
        },
      })
    } finally {
      // Always decrement the counter
      ongoingRequests--
    }
  } catch (error) {
    console.error('[API] Transcode error:', error)
    return NextResponse.json(
      { 
        success: false, 
        message: error instanceof Error ? error.message : 'Unknown error occurred' 
      },
      { status: 500 }
    )
  }
}