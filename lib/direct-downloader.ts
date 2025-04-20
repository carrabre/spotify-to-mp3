import ytdl from 'ytdl-core';
import fetch from 'node-fetch';
import axios from 'axios';

/**
 * Direct YouTube downloader that doesn't rely on s-ytdl
 * Uses ytdl-core as the primary method, with fallbacks
 */

interface DownloadResult {
  buffer: Buffer;
  size: number;
  mimeType: string;
}

// YouTube blocks requests without proper user agents
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0'
];

/**
 * Get a random user agent to bypass restrictions
 */
function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Sleep function for delays between retries
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Download audio from a YouTube video using ytdl-core
 */
export async function downloadYouTubeAudio(videoId: string): Promise<DownloadResult> {
  console.log(`[DirectDownloader] Starting download for videoId: ${videoId}`);
  
  try {
    // Try method 1: ytdl-core with improved options
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    // Add cookies and headers to make request look like it's from a browser
    const options = {
      requestOptions: {
        headers: {
          'User-Agent': getRandomUserAgent(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'cross-site',
        }
      }
    };
    
    // Add retries for reliability
    let retries = 3;
    let info;
    
    while (retries > 0) {
      try {
        info = await ytdl.getInfo(videoId, options);
        break;
      } catch (retryError: any) {
        retries--;
        if (retries === 0) throw retryError;
        
        // Log the error and retry after a delay
        console.log(`[DirectDownloader] Failed to get info (retries left: ${retries}):`, retryError.message);
        await sleep(1000 * (4 - retries)); // Exponential backoff
      }
    }
    
    if (!info) {
      throw new Error('Could not retrieve video info after retries');
    }
    
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
    const response = await fetch(format.url, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Referer': 'https://www.youtube.com/',
        'Origin': 'https://www.youtube.com'
      }
    });
    
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
  } catch (error: any) {
    console.error(`[DirectDownloader] Primary method failed:`, error);
    
    // If we get a 403 error, try the alternative method
    if (error.message && (error.message.includes('403') || error.message.includes('forbidden'))) {
      console.log(`[DirectDownloader] YouTube is blocking direct downloads, trying alternative method...`);
      return await downloadUsingAlternative(videoId);
    }
    
    throw error;
  }
}

/**
 * Alternative download method using a different approach
 */
async function downloadUsingAlternative(videoId: string): Promise<DownloadResult> {
  console.log(`[DirectDownloader] Using alternative download method for ${videoId}`);
  
  try {
    // First, get information about the video using YouTube's public APIs
    const infoResponse = await axios.get(`https://www.youtube.com/oembed?url=http://www.youtube.com/watch?v=${videoId}&format=json`, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'application/json'
      }
    });
    
    console.log(`[DirectDownloader] Got video info: ${infoResponse.data.title}`);
    
    // Get initial stream with ytdl-core in a different way
    const stream = ytdl(videoId, { 
      quality: 'highestaudio',
      filter: 'audioonly',
      highWaterMark: 1 << 25, // 32MB buffer
      requestOptions: {
        headers: {
          'User-Agent': getRandomUserAgent(),
          'Cookie': '', // Empty cookie to bypass some restrictions
          'x-youtube-identity-token': '',
        }
      }
    });
    
    // Collect data chunks
    const chunks: Buffer[] = [];
    let totalLength = 0;
    
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
        totalLength += chunk.length;
        console.log(`[DirectDownloader] Received chunk: ${chunk.length} bytes (total: ${totalLength})`);
      });
      
      stream.on('end', () => {
        const buffer = Buffer.concat(chunks, totalLength);
        console.log(`[DirectDownloader] Alternative download complete: ${buffer.length} bytes`);
        
        resolve({
          buffer,
          size: buffer.length,
          mimeType: 'audio/mp3' // Default to mp3, but it could be different
        });
      });
      
      stream.on('error', (err: Error) => {
        console.error(`[DirectDownloader] Alternative download error:`, err);
        reject(err);
      });
    });
  } catch (error: any) {
    console.error(`[DirectDownloader] Alternative download failed:`, error);
    throw new Error(`Alternative download method failed: ${error.message || 'Unknown error'}`);
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
    
    // Try an additional YT-based alternative here if needed
    // Currently we already have a fallback in the primary method
    
    // If all methods failed
    throw new Error(`Failed to download audio: ${error.message || 'Unknown error'}`);
  }
} 