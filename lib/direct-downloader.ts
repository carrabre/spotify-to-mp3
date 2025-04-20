import ytdl from 'ytdl-core';
import fetch from 'node-fetch';

/**
 * Direct YouTube downloader that doesn't rely on s-ytdl
 * Uses ytdl-core as the primary method, with fallbacks
 */

interface DownloadResult {
  buffer: Buffer;
  size: number;
  mimeType: string;
}

/**
 * Download audio from a YouTube video using ytdl-core
 */
export async function downloadYouTubeAudio(videoId: string): Promise<DownloadResult> {
  console.log(`[DirectDownloader] Starting download for videoId: ${videoId}`);
  
  try {
    // Try method 1: ytdl-core
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    const info = await ytdl.getInfo(videoId);
    console.log(`[DirectDownloader] Got video info: ${info.videoDetails.title}`);
    
    // Get the best audio format
    const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
    console.log(`[DirectDownloader] Found ${audioFormats.length} audio formats`);
    
    if (audioFormats.length === 0) {
      throw new Error('No audio formats available');
    }
    
    // Sort by quality (bitrate)
    const format = audioFormats
      .sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0))
      .find(format => format.url);
      
    if (!format || !format.url) {
      throw new Error('No valid audio URL found');
    }
    
    console.log(`[DirectDownloader] Selected format: ${format.container} (${format.audioBitrate}kbps)`);
    console.log(`[DirectDownloader] Downloading audio from URL`);
    
    // Download the audio directly
    const response = await fetch(format.url);
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
    }
    
    const buffer = await response.buffer();
    console.log(`[DirectDownloader] Download complete: ${buffer.length} bytes`);
    
    return {
      buffer,
      size: buffer.length,
      mimeType: format.mimeType || `audio/${format.container || 'mp3'}`
    };
  } catch (error) {
    console.error(`[DirectDownloader] Download failed:`, error);
    throw error;
  }
}

/**
 * Fallback method using multiple approaches
 */
export async function downloadWithFallback(videoId: string): Promise<DownloadResult> {
  try {
    // Try the primary method first
    return await downloadYouTubeAudio(videoId);
  } catch (error: any) {
    console.error(`[DirectDownloader] Primary download method failed:`, error);
    
    // If we reach here, all methods failed
    throw new Error(`Failed to download audio: ${error.message || 'Unknown error'}`);
  }
} 