import { NextRequest, NextResponse } from 'next/server';
import { downloadWithFallback } from '@/lib/direct-downloader';
import { LRUCache } from 'lru-cache';

/**
 * Optimized alt-transcode route that uses our high-performance downloader
 * This implementation aims for <10 second response times
 */

// Configure the API route
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// API response cache to avoid redundant downloads
const responseCache = new LRUCache<string, {
  buffer: Buffer, 
  mimeType: string,
  timestamp: number
}>({
  max: 100, // Cache up to 100 responses
  ttl: 1000 * 60 * 60 * 12, // Cache for 12 hours
});

// Performance metrics
const perfMetrics = {
  totalRequests: 0,
  successCount: 0,
  failureCount: 0,
  cacheHits: 0,
  totalResponseTimeMs: 0,
  get avgResponseTimeMs() {
    return this.totalRequests > 0 ? Math.round(this.totalResponseTimeMs / this.totalRequests) : 0;
  }
};

// Track performance
function recordMetrics(success: boolean, timeMs: number, fromCache: boolean = false) {
  perfMetrics.totalRequests++;
  if (success) {
    perfMetrics.successCount++;
  } else {
    perfMetrics.failureCount++;
  }
  
  if (fromCache) {
    perfMetrics.cacheHits++;
  }
  
  perfMetrics.totalResponseTimeMs += timeMs;
}

// Main API handler
export async function GET(request: NextRequest) {
  const requestId = Date.now().toString();
  const startTime = Date.now();
  console.log(`[alt-transcode][${requestId}] Starting request`);
  
  // Get the video ID from query parameters
  const searchParams = request.nextUrl.searchParams;
  let videoId = searchParams.get('v') || searchParams.get('videoId');
  
  if (!videoId) {
    console.error(`[alt-transcode][${requestId}] Missing video ID`);
    return NextResponse.json({ 
      error: 'Missing video ID'
    }, { status: 400 });
  }
  
  try {
    console.log(`[alt-transcode][${requestId}] Processing video ID: ${videoId}`);
    
    // Check cache first for ultra-fast response
    const cachedResponse = responseCache.get(videoId);
    if (cachedResponse) {
      const responseTimeMs = Date.now() - startTime;
      console.log(`[alt-transcode][${requestId}] Cache hit! Returning cached response in ${responseTimeMs}ms`);
      
      // Record metrics for cached response
      recordMetrics(true, responseTimeMs, true);
      
      return new NextResponse(cachedResponse.buffer, {
            status: 200,
            headers: {
          'Content-Type': cachedResponse.mimeType,
          'Content-Length': cachedResponse.buffer.length.toString(),
          'Cache-Control': 'public, max-age=86400', // Browser cache for 24 hours
          'X-Request-ID': requestId,
          'X-Cache': 'HIT',
          'X-Response-Time': `${responseTimeMs}ms`
        }
      });
    }
    
    // Fast path - use our optimized downloader with improved error handling
    try {
      console.log(`[alt-transcode][${requestId}] Attempting download for videoId: ${videoId}`);
      
      // Added global try/catch with additional error reporting
      let downloadResult;
      try {
        // Set a timeout to abort if download takes too long
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => {
          console.error(`[alt-transcode][${requestId}] Download timeout exceeded (45s), aborting`);
          abortController.abort();
        }, 45000);
        
        try {
          downloadResult = await Promise.race([
            downloadWithFallback(videoId),
            new Promise<never>((_, reject) => {
              abortController.signal.addEventListener('abort', () => {
                reject(new Error('Download timed out after 45 seconds'));
              });
            })
          ]);
          
          // Clear timeout if successful
          clearTimeout(timeoutId);
        } catch (timeoutError) {
          console.error(`[alt-transcode][${requestId}] Download timed out or aborted:`, 
            timeoutError instanceof Error ? {
              name: timeoutError.name,
              message: timeoutError.message
            } : String(timeoutError)
          );
          throw timeoutError;
        }
      } catch (innerError) {
        console.error(`[alt-transcode][${requestId}] Inner download error:`, 
          innerError instanceof Error ? {
            name: innerError.name,
            message: innerError.message,
            stack: innerError.stack
          } : String(innerError)
        );
        
        // Check for memory issues
        try {
          const memUsage = process.memoryUsage();
          console.error(`[alt-transcode][${requestId}] Memory stats at error:`, {
            rss: Math.round(memUsage.rss / 1024 / 1024) + ' MB',
            heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + ' MB',
            heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB',
            external: Math.round(memUsage.external / 1024 / 1024) + ' MB'
          });
        } catch (memError) {
          console.error(`[alt-transcode][${requestId}] Error getting memory usage:`, memError);
        }
        
        // Re-throw with better context
        throw new Error(`Download failed with error: ${innerError instanceof Error ? innerError.message : String(innerError)}`);
      }
      
      // Cache the successful response
      responseCache.set(videoId, {
        buffer: downloadResult.buffer,
        mimeType: downloadResult.mimeType,
        timestamp: Date.now()
      });
      
      const responseTimeMs = Date.now() - startTime;
      console.log(`[alt-transcode][${requestId}] Download successful in ${responseTimeMs}ms, size: ${downloadResult.size} bytes`);
      
      // Record metrics
      recordMetrics(true, responseTimeMs);
      
      return new NextResponse(downloadResult.buffer, {
        status: 200,
        headers: {
          'Content-Type': downloadResult.mimeType,
          'Content-Length': downloadResult.size.toString(),
          'Cache-Control': 'public, max-age=86400',
          'X-Request-ID': requestId,
          'X-Cache': 'MISS',
          'X-Response-Time': `${responseTimeMs}ms`
        }
      });
    } catch (downloadError) {
      // Log specific download error to help debugging
      console.error(`[alt-transcode][${requestId}] Download error:`, 
        downloadError instanceof Error ? {
          name: downloadError.name,
          message: downloadError.message,
          stack: downloadError.stack
        } : String(downloadError)
      );
      
      // Re-throw to be caught by the outer try-catch
      throw downloadError;
    }
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;
    console.error(`[alt-transcode][${requestId}] Error after ${responseTimeMs}ms:`, 
      error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack?.split('\n').slice(0, 3).join('\n') // Include a few stack frames
      } : String(error)
    );
    
    // Record failure metrics
    recordMetrics(false, responseTimeMs);
    
    // Send a more informative error response
    return NextResponse.json({
      error: "Unable to download this audio. Please try a different song or try again later.",
      message: error instanceof Error ? error.message : String(error),
      videoId,
      suggestion: "You can try the fallback endpoint at /api/transcode",
      metrics: {
        totalRequests: perfMetrics.totalRequests,
        successRate: perfMetrics.totalRequests > 0 ? 
          Math.round((perfMetrics.successCount / perfMetrics.totalRequests) * 100) : 0,
        avgResponseTimeMs: perfMetrics.avgResponseTimeMs,
        cacheHitRate: perfMetrics.totalRequests > 0 ?
          Math.round((perfMetrics.cacheHits / perfMetrics.totalRequests) * 100) : 0
      }
    }, { 
      status: 500,
      headers: {
        'X-Response-Time': `${responseTimeMs}ms`,
        'X-Error-Handled': 'true'
      }
    });
  }
} 