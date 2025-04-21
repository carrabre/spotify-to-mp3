import type { Innertube } from 'youtubei.js';
import fetch, { RequestInfo, RequestInit, Response } from 'node-fetch';
import http from 'http';
import https from 'https';
import { LRUCache } from 'lru-cache';

/**
 * Optimized YouTube downloader using YouTubeJS (youtubei.js)
 * Enhanced for speed and reliability
 */

interface DownloadResult {
  buffer: Buffer;
  size: number;
  mimeType: string;
}

// Interface for streaming data formats
interface StreamingFormat {
  url: string;
  mime_type: string;
  bitrate?: number;
}

// Interface for cached format info
interface CachedFormatInfo {
  url: string;
  mimeType: string;
  timestamp: number;
  expiry: number;
}

// YouTube blocks requests without proper user agents
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

// Create persistent HTTP/HTTPS agents for connection pooling
const httpAgent = new http.Agent({ 
  keepAlive: true, 
  maxSockets: 100,
  timeout: 60000
});

const httpsAgent = new https.Agent({ 
  keepAlive: true, 
  maxSockets: 100,
  timeout: 60000
});

// Cache for storing format information to avoid repeated API calls
// Format: videoId -> { url, mimeType, timestamp, expiry }
const formatCache = new LRUCache<string, CachedFormatInfo>({
  max: 1000, // Store up to 1000 video formats
  ttl: 1000 * 60 * 60 * 6, // Cache for 6 hours
});

// Performance tracking to prioritize faster methods
const methodPerformance = {
  primary: { successes: 0, failures: 0, avgTime: 0 },
  streaming: { successes: 0, failures: 0, avgTime: 0 },
  fullInfo: { successes: 0, failures: 0, avgTime: 0 }
};

/**
 * Get a random user agent to bypass restrictions
 */
function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Create a optimized custom fetch function with connection pooling
 */
function createCustomFetch(userAgent: string) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    // Keep headers minimal but effective
    const headers = {
      'User-Agent': userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Connection': 'keep-alive',
      'Referer': 'https://www.youtube.com/',
      'Origin': 'https://www.youtube.com',
      ...(init?.headers || {})
    };

    return fetch(input, {
      ...init,
      headers,
      agent: function(_parsedURL) {
        return _parsedURL.protocol === 'https:' ? httpsAgent : httpAgent;
      }
    });
  };
}

// Handle dynamic import of Innertube with singleton pattern
let youtubeJsModule: any = null;
let innertubeInstances: Record<string, any> = {};

async function getInnertube(userAgent: string): Promise<any> {
  const instanceId = Date.now().toString().substr(-6);
  console.log(`[DirectDownloader][Innertube-${instanceId}] Initializing Innertube instance`);
  
  try {
    if (!youtubeJsModule) {
      console.log(`[DirectDownloader][Innertube-${instanceId}] Loading youtubei.js module...`);
      const importStartTime = Date.now();
      
      try {
        youtubeJsModule = await import('youtubei.js');
        console.log(`[DirectDownloader][Innertube-${instanceId}] YouTubeJS module loaded in ${Date.now() - importStartTime}ms`);
      } catch (importError) {
        console.error(`[DirectDownloader][Innertube-${instanceId}] Failed to import youtubei.js:`, 
          importError instanceof Error ? {
            name: importError.name,
            message: importError.message,
            stack: importError.stack?.split('\n')[0]
          } : String(importError)
        );
        throw importError;
      }
    }
    
    // Reuse instances to prevent memory leaks and improve performance
    if (!innertubeInstances[userAgent]) {
      console.log(`[DirectDownloader][Innertube-${instanceId}] Creating new Innertube instance with cache`);
      const createStartTime = Date.now();
      
      try {
        innertubeInstances[userAgent] = await youtubeJsModule.Innertube.create({
          fetch: createCustomFetch(userAgent),
          cache: new youtubeJsModule.UniversalCache(true)
        });
        console.log(`[DirectDownloader][Innertube-${instanceId}] Innertube instance created in ${Date.now() - createStartTime}ms`);
      } catch (createError) {
        console.error(`[DirectDownloader][Innertube-${instanceId}] Failed to create Innertube instance:`, 
          createError instanceof Error ? {
            name: createError.name,
            message: createError.message,
            stack: createError.stack?.split('\n')[0]
          } : String(createError)
        );
        throw createError;
      }
    } else {
      console.log(`[DirectDownloader][Innertube-${instanceId}] Reusing existing Innertube instance`);
    }
    
    return innertubeInstances[userAgent];
  } catch (error) {
    console.error(`[DirectDownloader][Innertube-${instanceId}] Error initializing Innertube:`, 
      error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : String(error)
    );
    throw error;
  }
}

/**
 * Check format cache before making API calls
 */
function getCachedFormat(videoId: string): CachedFormatInfo | null {
  const cachedFormat = formatCache.get(videoId);
  if (cachedFormat && Date.now() < cachedFormat.expiry) {
    console.log(`[DirectDownloader] Using cached format for ${videoId}`);
    return cachedFormat;
  }
  return null;
}

/**
 * Store format in cache for future use
 */
function cacheFormat(videoId: string, url: string, mimeType: string): void {
  formatCache.set(videoId, {
    url,
    mimeType,
    timestamp: Date.now(),
    expiry: Date.now() + 1000 * 60 * 60 * 6 // 6 hours
  });
}

/**
 * Update performance metrics for a method
 */
function updatePerformance(method: 'primary' | 'streaming' | 'fullInfo', success: boolean, timeMs: number): void {
  const stats = methodPerformance[method];
  
  if (success) {
    stats.successes++;
    // Exponential moving average for time
    stats.avgTime = stats.avgTime === 0 
      ? timeMs 
      : 0.7 * stats.avgTime + 0.3 * timeMs;
  } else {
    stats.failures++;
  }
}

/**
 * Get the most reliable method based on success rate and speed
 */
function getMostReliableMethod(): ('primary' | 'streaming' | 'fullInfo')[] {
  // Calculate success rates
  const methods = ['primary', 'streaming', 'fullInfo'] as const;
  const scores = methods.map(method => {
    const stats = methodPerformance[method];
    const total = stats.successes + stats.failures;
    
    // Default score if no data
    if (total === 0) {
      // Start with streaming method as default since it's more reliable
      if (method === 'streaming') return { method, score: 0.7 };
      if (method === 'primary') return { method, score: 0.6 };
      return { method, score: 0.5 };
    }
    
    const successRate = stats.successes / total;
    const speedScore = stats.avgTime > 0 ? 10000 / stats.avgTime : 0;
    
    // Combined score - success rate matters more than speed
    let score = (successRate * 0.7) + (speedScore * 0.3);
    
    // Boost streaming method if primary is failing a lot
    if (method === 'streaming' && methodPerformance.primary.failures > methodPerformance.primary.successes) {
      score *= 1.2;
    }
    
    // Reduce score for methods that fail more than succeed
    if (stats.failures > stats.successes && stats.failures > 3) {
      score *= 0.7;
    }
    
    return { method, score };
  });
  
  // Sort by score descending
  return scores
    .sort((a, b) => b.score - a.score)
    .map(item => item.method);
}

/**
 * Download directly using cached format URL
 */
async function downloadWithCachedFormat(videoId: string, cachedFormat: CachedFormatInfo): Promise<DownloadResult> {
  console.log(`[DirectDownloader] Downloading with cached format URL`);
  const userAgent = getRandomUserAgent();
  
  // Add timeout handling
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  
  try {
    // Download using the direct URL
    const response = await fetch(cachedFormat.url, {
      headers: {
        'User-Agent': userAgent,
        'Referer': 'https://www.youtube.com/',
        'Origin': 'https://www.youtube.com'
      },
      signal: controller.signal as AbortSignal
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
    }
    
    const buffer = await response.buffer();
    console.log(`[DirectDownloader] Cached format download complete: ${buffer.length} bytes`);
    
    return {
      buffer,
      size: buffer.length,
      mimeType: cachedFormat.mimeType
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Primary download method using YouTube.js download stream
 */
async function primaryDownloadMethod(videoId: string): Promise<DownloadResult> {
  console.log(`[DirectDownloader] Using primary download method`);
  const startTime = Date.now();
  
  try {
    const userAgent = getRandomUserAgent();
    console.log(`[DirectDownloader][Primary] Using User-Agent: ${userAgent.substring(0, 20)}...`);
    
    console.log(`[DirectDownloader][Primary] Getting Innertube instance...`);
    const youtube = await getInnertube(userAgent);
    console.log(`[DirectDownloader][Primary] Innertube instance ready`);
    
    // Add a fallback mechanism for throttled formats
    try {
      console.log(`[DirectDownloader][Primary] Checking if video has streaming data before download attempt`);
      const streamCheckData = await youtube.getStreamingData(videoId, {
        type: 'audio'
      }).catch((e: any) => {
        console.log(`[DirectDownloader][Primary] Error pre-checking streaming data: ${e.message}`);
        return null;
      });
      
      // If we couldn't get streaming data, let's just throw and let the fallback handle it
      if (!streamCheckData || !streamCheckData.formats || streamCheckData.formats.length === 0) {
        console.log(`[DirectDownloader][Primary] No streaming data available, likely formatting issue or throttling`);
        throw new Error("No streaming data available for this video. Falling back to alternative method.");
      }
      
      console.log(`[DirectDownloader][Primary] Pre-check successful, found ${streamCheckData.formats.length} formats`);
    } catch (streamCheckError) {
      console.error(`[DirectDownloader][Primary] Stream check failed, skipping primary method:`, 
        streamCheckError instanceof Error ? streamCheckError.message : String(streamCheckError));
      throw streamCheckError;
    }
    
    // Get the download stream
    console.log(`[DirectDownloader][Primary] Starting download stream for videoId: ${videoId}`);
    const downloadStartTime = Date.now();
    
    try {
      // Try with a timeout to prevent hanging
      const downloadPromise = youtube.download(videoId, {
        type: 'audio',
        quality: 'best'
      });
      
      // Add a separate timeout for the initial download call
      const downloadStream = await Promise.race([
        downloadPromise,
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Download stream initialization timed out after 10s')), 10000)
        )
      ]);
      
      console.log(`[DirectDownloader][Primary] Download stream obtained in ${Date.now() - downloadStartTime}ms`);
      
      // Convert the ReadableStream to a buffer more efficiently
      const reader = downloadStream.getReader();
      const chunks: Uint8Array[] = [];
      let totalLength = 0;
      let chunkCount = 0;
      
      // Add timeout for safety
      const controller = new AbortController();
      const signal = controller.signal;
      const timeoutId = setTimeout(() => {
        console.log(`[DirectDownloader][Primary] Download timed out after 30s`);
        controller.abort();
      }, 30000);
      
      console.log(`[DirectDownloader][Primary] Reading chunks from stream...`);
      const readStartTime = Date.now();
      
      try {
        // Add timeout for first chunk to detect stalled downloads
        let firstChunkReceived = false;
        const firstChunkTimeoutId = setTimeout(() => {
          if (!firstChunkReceived) {
            console.log(`[DirectDownloader][Primary] No data received in 5s, aborting download`);
            controller.abort();
          }
        }, 5000);
        
        while (!signal.aborted) {
          try {
            const { done, value } = await reader.read();
            if (done) break;
            
            if (!firstChunkReceived) {
              firstChunkReceived = true;
              clearTimeout(firstChunkTimeoutId);
              console.log(`[DirectDownloader][Primary] First chunk received after ${Date.now() - readStartTime}ms`);
            }
            
            chunks.push(value);
            totalLength += value.length;
            chunkCount++;
            
            // Log progress periodically
            if (chunkCount % 10 === 0) {
              console.log(`[DirectDownloader][Primary] Read ${chunkCount} chunks, ${totalLength} bytes so far`);
            }
          } catch (chunkError) {
            console.error(`[DirectDownloader][Primary] Error reading chunk:`, 
              chunkError instanceof Error ? chunkError.message : String(chunkError));
            
            // If we've already received some data, we can try to continue with what we have
            if (chunks.length > 0 && totalLength > 10000) {
              console.log(`[DirectDownloader][Primary] Stream error but we have ${totalLength} bytes, continuing with partial data`);
              break;
            } else {
              throw chunkError;
            }
          }
        }
      } catch (readError) {
        console.error(`[DirectDownloader][Primary] Error reading from stream:`, 
          readError instanceof Error ? {
            name: readError.name,
            message: readError.message,
            stack: readError.stack?.split('\n')[0]
          } : String(readError)
        );
        throw readError;
      } finally {
        clearTimeout(timeoutId);
        console.log(`[DirectDownloader][Primary] Finished reading after ${Date.now() - readStartTime}ms, ${chunkCount} chunks, ${totalLength} bytes`);
      }
      
      if (signal.aborted) {
        throw new Error('Download timed out after 30 seconds');
      }
      
      // Verify we actually got some data
      if (chunks.length === 0 || totalLength === 0) {
        throw new Error('No data received from download stream');
      }
      
      // Get basic info in parallel with download if not already completed
      console.log(`[DirectDownloader][Primary] Getting basic info for videoId: ${videoId}`);
      const infoStartTime = Date.now();
      
      try {
        const info = await youtube.getBasicInfo(videoId);
        console.log(`[DirectDownloader][Primary] Got basic info in ${Date.now() - infoStartTime}ms`);
        
        const audioFormat = info.streaming_data?.adaptive_formats?.find((format: any) => 
          format.mime_type.includes('audio')
        );
        
        console.log(`[DirectDownloader][Primary] Audio format:`, audioFormat ? {
          mimeType: audioFormat.mime_type,
          bitrate: audioFormat.bitrate,
          hasUrl: !!audioFormat.url
        } : 'Not found');
        
        const mimeType = audioFormat?.mime_type.split(';')[0] || 'audio/mp4';
        
        // Create a single concatenated buffer instead of multiple small buffers
        console.log(`[DirectDownloader][Primary] Creating buffer from ${chunks.length} chunks`);
        const buffer = Buffer.concat(chunks);
        
        // Validate buffer has enough data to be valid
        if (buffer.length < 1000) {
          throw new Error(`Buffer too small (${buffer.length} bytes), likely incomplete download`);
        }
        
        // Cache format info for future use if URL is available
        if (audioFormat?.url) {
          console.log(`[DirectDownloader][Primary] Caching format URL for future use`);
          cacheFormat(videoId, audioFormat.url, mimeType);
        }
        
        console.log(`[DirectDownloader][Primary] Download complete: ${buffer.length} bytes, type: ${mimeType}`);
        
        // Track performance
        const endTime = Date.now();
        updatePerformance('primary', true, endTime - startTime);
        
        return {
          buffer,
          size: buffer.length,
          mimeType
        };
      } catch (infoError) {
        console.error(`[DirectDownloader][Primary] Error getting basic info:`, 
          infoError instanceof Error ? {
            name: infoError.name,
            message: infoError.message,
            stack: infoError.stack?.split('\n')[0]
          } : String(infoError)
        );
        
        // If we have valid data but just can't get format info, use a default MIME type
        if (chunks.length > 0 && totalLength > 10000) {
          console.log(`[DirectDownloader][Primary] Info error but we have ${totalLength} bytes, continuing with default MIME type`);
          const buffer = Buffer.concat(chunks);
          return {
            buffer,
            size: buffer.length,
            mimeType: 'audio/mp4' // Default MIME type
          };
        }
        
        throw infoError;
      }
    } catch (downloadError) {
      console.error(`[DirectDownloader][Primary] Error initiating download stream:`, 
        downloadError instanceof Error ? {
          name: downloadError.name,
          message: downloadError.message,
          stack: downloadError.stack?.split('\n')[0]
        } : String(downloadError)
      );
      throw downloadError;
    }
  } catch (error) {
    const endTime = Date.now();
    updatePerformance('primary', false, endTime - startTime);
    console.error(`[DirectDownloader][Primary] Method failed after ${endTime - startTime}ms:`, 
      error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : String(error)
    );
    throw error;
  }
}

/**
 * Download using streaming data API (faster than full info)
 */
async function streamingDataMethod(videoId: string): Promise<DownloadResult> {
  console.log(`[DirectDownloader] Using streaming data method`);
  const startTime = Date.now();
  const methodId = `stream-${Date.now().toString().substr(-6)}`;
  
  try {
    const userAgent = getRandomUserAgent();
    console.log(`[DirectDownloader][${methodId}] Using User-Agent: ${userAgent.substring(0, 20)}...`);
    
    console.log(`[DirectDownloader][${methodId}] Getting Innertube instance...`);
    const youtube = await getInnertube(userAgent);
    console.log(`[DirectDownloader][${methodId}] Innertube instance ready`);
    
    // Get streaming data with direct URLs
    console.log(`[DirectDownloader][${methodId}] Getting streaming data for videoId: ${videoId}`);
    const streamingStartTime = Date.now();
    
    let streamingData;
    try {
      streamingData = await youtube.getStreamingData(videoId, {
        type: 'audio'
      });
      console.log(`[DirectDownloader][${methodId}] Got streaming data in ${Date.now() - streamingStartTime}ms`);
    } catch (streamingError) {
      console.error(`[DirectDownloader][${methodId}] Error getting streaming data:`, 
        streamingError instanceof Error ? {
          name: streamingError.name,
          message: streamingError.message,
          stack: streamingError.stack?.split('\n')[0]
        } : String(streamingError)
      );
      throw streamingError;
    }
    
    // Find audio formats and sort by bitrate
    console.log(`[DirectDownloader][${methodId}] Processing available formats...`);
    const allFormats = streamingData.formats || [];
    console.log(`[DirectDownloader][${methodId}] Total formats available: ${allFormats.length}`);
    
    const audioFormats = allFormats
      .filter((format: any) => format.mime_type?.includes('audio'))
      .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
    
    console.log(`[DirectDownloader][${methodId}] Audio formats found: ${audioFormats.length}`);
    
    if (!audioFormats.length) {
      console.error(`[DirectDownloader][${methodId}] No audio formats found in streaming data`);
      throw new Error('No suitable audio format found');
    }
    
    // Get the best audio format
    const audioFormat = audioFormats[0];
    console.log(`[DirectDownloader][${methodId}] Selected audio format:`, {
      mimeType: audioFormat.mime_type,
      bitrate: audioFormat.bitrate,
      hasUrl: !!audioFormat.url,
      quality: audioFormat.quality_label || audioFormat.quality
    });
    
    if (!audioFormat.url) {
      console.error(`[DirectDownloader][${methodId}] Audio format URL is missing`);
      throw new Error('Audio format URL is missing');
    }
    
    // Cache the URL for future use
    const mimeType = audioFormat.mime_type.split(';')[0] || 'audio/mp4';
    console.log(`[DirectDownloader][${methodId}] Caching format URL for future use, mime type: ${mimeType}`);
    cacheFormat(videoId, audioFormat.url, mimeType);
    
    // Download using the direct URL with timeouts
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.log(`[DirectDownloader][${methodId}] Download timed out after 30s`);
      controller.abort();
    }, 30000);
    
    console.log(`[DirectDownloader][${methodId}] Downloading audio using URL...`);
    const downloadStartTime = Date.now();
    
    try {
      const response = await fetch(audioFormat.url, {
        headers: {
          'User-Agent': userAgent,
          'Referer': 'https://www.youtube.com/',
          'Origin': 'https://www.youtube.com'
        },
        signal: controller.signal as AbortSignal
      });
      
      console.log(`[DirectDownloader][${methodId}] Received response: HTTP ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        console.error(`[DirectDownloader][${methodId}] HTTP error: ${response.status} ${response.statusText}`);
        throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
      }
      
      const contentType = response.headers.get('Content-Type');
      const contentLength = response.headers.get('Content-Length');
      console.log(`[DirectDownloader][${methodId}] Content-Type: ${contentType}, Content-Length: ${contentLength}`);
      
      // Get buffer efficiently
      console.log(`[DirectDownloader][${methodId}] Reading response buffer...`);
      const bufferStartTime = Date.now();
      const buffer = await response.buffer();
      console.log(`[DirectDownloader][${methodId}] Buffer read in ${Date.now() - bufferStartTime}ms, size: ${buffer.length} bytes`);
      
      console.log(`[DirectDownloader][${methodId}] Download complete in ${Date.now() - downloadStartTime}ms, size: ${buffer.length} bytes`);
      
      // Track performance
      const endTime = Date.now();
      updatePerformance('streaming', true, endTime - startTime);
      
      return {
          buffer,
          size: buffer.length,
        mimeType
      };
    } catch (fetchError) {
      console.error(`[DirectDownloader][${methodId}] Error fetching audio:`, 
        fetchError instanceof Error ? {
          name: fetchError.name,
          message: fetchError.message,
          stack: fetchError.stack?.split('\n')[0]
        } : String(fetchError)
      );
      throw fetchError;
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    const endTime = Date.now();
    updatePerformance('streaming', false, endTime - startTime);
    console.error(`[DirectDownloader][${methodId}] Method failed after ${endTime - startTime}ms:`, 
      error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : String(error)
    );
    throw error;
  }
}

/**
 * Full info download method - slower but more reliable
 */
async function fullInfoMethod(videoId: string): Promise<DownloadResult> {
  console.log(`[DirectDownloader] Using full info method`);
  const startTime = Date.now();
  
  try {
    const userAgent = getRandomUserAgent();
    const youtube = await getInnertube(userAgent);
    
    // Get full video info
    const info = await youtube.getInfo(videoId);
    
    // Get all audio formats and sort by bitrate
    const audioFormats = info.streaming_data.adaptive_formats
      .filter((format: any) => format.mime_type.includes('audio'))
      .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
    
    if (!audioFormats.length) {
      throw new Error('No audio formats found');
    }
    
    // Get the best audio format
    const audioFormat = audioFormats[0];
    
    // Cache the URL for future use
    const mimeType = audioFormat.mime_type.split(';')[0] || 'audio/mp4';
    cacheFormat(videoId, audioFormat.url, mimeType);
    
    // Download using the URL
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    try {
      const response = await fetch(audioFormat.url, {
        headers: {
          'User-Agent': userAgent,
          'Referer': 'https://www.youtube.com/',
          'Origin': 'https://www.youtube.com'
        },
        signal: controller.signal as AbortSignal
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      const buffer = await response.buffer();
      console.log(`[DirectDownloader] Full info download complete: ${buffer.length} bytes`);
      
      // Track performance
      const endTime = Date.now();
      updatePerformance('fullInfo', true, endTime - startTime);
      
      return {
        buffer,
        size: buffer.length,
        mimeType
      };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    const endTime = Date.now();
    updatePerformance('fullInfo', false, endTime - startTime);
    throw error;
  }
}

/**
 * Main download function with optimal method selection
 */
export async function downloadYouTubeAudio(videoId: string): Promise<DownloadResult> {
  const startTime = Date.now();
  const traceId = `${videoId.substr(0, 6)}-${Date.now().toString().substr(-6)}`;
  console.log(`[DirectDownloader][${traceId}] Starting optimized download for videoId: ${videoId}`);
  
  // First check if we have a cached format
  const cachedFormat = getCachedFormat(videoId);
  if (cachedFormat) {
    try {
      console.log(`[DirectDownloader][${traceId}] Using cached format, age: ${Math.round((Date.now() - cachedFormat.timestamp) / 1000)}s`);
      return await downloadWithCachedFormat(videoId, cachedFormat);
    } catch (cacheError) {
      console.error(`[DirectDownloader][${traceId}] Cached format download failed:`, 
        cacheError instanceof Error ? {
          name: cacheError.name,
          message: cacheError.message,
          stack: cacheError.stack?.split('\n')[0]
        } : String(cacheError)
      );
      // Format might be expired, continue with regular methods
      formatCache.delete(videoId); // Remove invalid cache entry
      console.log(`[DirectDownloader][${traceId}] Removed invalid cache entry, trying alternative methods`);
    }
  }
  
  // If streaming method has been more reliable recently, try streaming first,
  // otherwise use the normal order
  let methods = getMostReliableMethod();
  
  // If primary method has failed more than it succeeded, try streaming first
  if (methodPerformance.primary.failures > methodPerformance.primary.successes && 
      methodPerformance.primary.failures > 2) {
    console.log(`[DirectDownloader][${traceId}] Primary method has been failing, preferring streaming method first`);
    // Move streaming to front if it's not already
    if (methods[0] !== 'streaming') {
      methods = ['streaming', ...methods.filter(m => m !== 'streaming')];
    }
  }
  
  const errors: Error[] = [];
  
  console.log(`[DirectDownloader][${traceId}] Using method order: ${methods.join(', ')}`);
  
  // Try methods in order of reliability
  for (const method of methods) {
    try {
      console.log(`[DirectDownloader][${traceId}] Attempting ${method} method`);
      const methodStartTime = Date.now();
      
      let result: DownloadResult;
      switch (method) {
        case 'primary':
          result = await primaryDownloadMethod(videoId);
          break;
        case 'streaming':
          result = await streamingDataMethod(videoId);
          break;
        case 'fullInfo':
          result = await fullInfoMethod(videoId);
          break;
        default:
          throw new Error(`Unknown method: ${method}`);
      }
      
      const methodTimeMs = Date.now() - methodStartTime;
      console.log(`[DirectDownloader][${traceId}] ${method} method succeeded in ${methodTimeMs}ms, size: ${result.size} bytes`);
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[DirectDownloader][${traceId}] Method ${method} failed:`, 
        error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack?.split('\n')[0]
        } : String(error)
      );
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }
  
  // All methods failed
  const totalTime = Date.now() - startTime;
  const errorMessages = errors.map(e => e.message).join('; ');
  console.error(`[DirectDownloader][${traceId}] All download methods failed after ${totalTime}ms. Errors: ${errorMessages}`);
  
  throw new Error(`Failed to download audio for ${videoId}: ${errorMessages}`);
}

/**
 * Export fallback function for backward compatibility
 */
export async function downloadWithFallback(videoId: string): Promise<DownloadResult> {
  try {
    return await downloadYouTubeAudio(videoId);
  } catch (error) {
    // Add more context to the error
    const enhancedError = new Error(
      `Download failed for video ${videoId}: ${error instanceof Error ? error.message : String(error)}`
    );
    if (error instanceof Error) {
      enhancedError.stack = error.stack;
    }
    throw enhancedError;
  }
} 