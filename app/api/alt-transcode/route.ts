import { NextRequest, NextResponse } from 'next/server';
import ytdl from 'ytdl-core';
import fetch from 'node-fetch';
import { Agent } from 'https';
import { v4 as uuidv4 } from 'uuid';

// Interface for the downloaded data
interface AudioResult {
  buffer: Buffer;
  size: number;
  mimeType: string;
}

// Configure the API route
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Check environment
const isVercelEnvironment = !!process.env.VERCEL;

// Rotating user agents to mimic real browsers
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
];

// Common YouTube cookies to help bypass restrictions (update these regularly)
// Replace with your own cookies from a logged-in browser session for best results
const YOUTUBE_COOKIES = [
  process.env.YOUTUBE_COOKIES || 
  'CONSENT=YES+cb; VISITOR_INFO1_LIVE=somevalue; YSC=somevalue; PREF=f4=4000000&tz=America.New_York'
];

// Proxy configuration (optional - add your proxies if needed)
const PROXIES = process.env.YTDL_PROXIES ? 
  process.env.YTDL_PROXIES.split(',') : 
  [];

// Utility functions
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const getRandomUserAgent = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
const getRandomCookies = () => YOUTUBE_COOKIES[Math.floor(Math.random() * YOUTUBE_COOKIES.length)];
const getRandomProxy = () => PROXIES.length > 0 ? PROXIES[Math.floor(Math.random() * PROXIES.length)] : null;

// Create realistic browser headers
function getBrowserHeaders(userAgent: string, referer: string = 'https://www.youtube.com/') {
  return {
    'User-Agent': userAgent,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Sec-CH-UA': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
    'Sec-CH-UA-Mobile': '?0',
    'Sec-CH-UA-Platform': '"Windows"',
    'Priority': 'u=0, i',
    'Cookie': getRandomCookies(),
    'Referer': referer,
    'Origin': 'https://www.youtube.com'
  };
}

// Configure agent with proxy support
function createProxyAgent(proxy: string | null) {
  // For production, consider using a proper HTTP/HTTPS proxy library
  // such as 'https-proxy-agent' instead of this basic implementation
  return new Agent({ 
    keepAlive: true, 
    timeout: 30000
  });
}

// Additional fetch options when using a proxy
function getProxyFetchOptions(proxy: string | null) {
  if (!proxy) return {};
  
  // This is a simplified implementation
  // In a production environment, you'd want to use proper proxy libraries
  // or set environment variables like HTTP_PROXY/HTTPS_PROXY
  return {
    // Note: Node's fetch implementation doesn't directly support proxy options
    // You'd need to use a proxy agent library in production
  };
}

// Main API handler
export async function GET(request: NextRequest) {
  const requestId = Date.now().toString();
  console.log(`[alt-transcode][${requestId}] Starting request`);
  
  // Get the video ID from the query parameters (try both v and videoId)
  const searchParams = request.nextUrl.searchParams;
  let videoId = searchParams.get('v') || searchParams.get('videoId');
  
  if (!videoId) {
    console.error(`[alt-transcode][${requestId}] Missing video ID`);
    return NextResponse.json({ 
      error: 'Missing video ID',
      debug: {
        timestamp: new Date().toISOString(),
        requestId
      }
    }, { status: 400 });
  }
  
  try {
    console.log(`[alt-transcode][${requestId}] Processing video ID: ${videoId}`);
    
    // Try multiple download methods in sequence with retries
    const methods = [
      proxyStreamMethod,
      directDownloadMethod,
      standardYtdlMethod,
      fallbackYtdlMethod
    ];
    
    let lastError: any = null;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      for (const method of methods) {
        try {
          console.log(`[alt-transcode][${requestId}] Trying method: ${method.name}, attempt ${retryCount + 1}`);
          const result = await method(videoId, requestId);
          
          if (result.size < 1000) {
            // Too small to be valid audio, likely an error page
            throw new Error(`Result too small (${result.size} bytes), likely blocked`);
          }
          
          console.log(`[alt-transcode][${requestId}] Success with ${method.name}, size: ${result.size} bytes`);
          
          return new NextResponse(result.buffer, {
            status: 200,
            headers: {
              'Content-Type': result.mimeType,
              'Content-Length': result.size.toString(),
              'Content-Disposition': `attachment; filename="${videoId}.mp3"`,
              'Cache-Control': 'public, max-age=31536000, immutable'
            }
          });
        } catch (error: any) {
          console.error(`[alt-transcode][${requestId}] Method ${method.name} failed: ${error.message}`);
          lastError = error;
          // Slightly longer delay between attempts as retries increase
          await sleep(2000 * (retryCount + 1));
        }
      }
      
      retryCount++;
      // Exponential backoff between retry rounds
      if (retryCount < maxRetries) {
        await sleep(5000 * retryCount);
      }
    }
    
    // If we reach here, all methods failed
    throw new Error(lastError?.message || 'All download methods failed');
    
  } catch (error: any) {
    console.error(`[alt-transcode][${requestId}] Error: ${error.message}`);
    
    return NextResponse.json({
      error: "Unable to download this audio. Please try a different song or try again later.",
      message: error.message,
      videoId,
      debug: {
        timestamp: new Date().toISOString(),
        isVercel: isVercelEnvironment,
        requestId
      }
    }, { status: 500 });
  }
}

// Method 1: Downloads via proxy-style stream for maximum compatibility
async function proxyStreamMethod(videoId: string, requestId: string): Promise<AudioResult> {
  const userAgent = getRandomUserAgent();
  const proxy = getRandomProxy();
  
  const options = {
    quality: 'highestaudio',
    filter: 'audioonly' as ytdl.Filter,
    highWaterMark: 1 << 25, // 32MB buffer to prevent backpressure
    requestOptions: {
      headers: getBrowserHeaders(userAgent),
      agent: createProxyAgent(proxy)
    }
  };
  
  return new Promise((resolve, reject) => {
    try {
      console.log(`[alt-transcode:proxyStream][${requestId}] Starting stream for ${videoId}${proxy ? ' via proxy' : ''}`);
      
      const stream = ytdl(`https://www.youtube.com/watch?v=${videoId}`, options);
      const chunks: Buffer[] = [];
      let totalLength = 0;
      let mimeType = 'audio/mp4';
      
      stream.on('info', (info, format) => {
        if (format && format.mimeType) {
          mimeType = format.mimeType.split(';')[0];
          console.log(`[alt-transcode:proxyStream][${requestId}] Got format info: ${mimeType}, itag: ${format.itag}`);
        }
      });
      
      stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
        totalLength += chunk.length;
      });
      
      stream.on('end', () => {
        if (totalLength === 0) {
          return reject(new Error('Zero bytes received'));
        }
        
        const buffer = Buffer.concat(chunks, totalLength);
        resolve({
          buffer,
          size: buffer.length,
          mimeType
        });
      });
      
      stream.on('error', (error) => {
        reject(error);
      });
      
      // Add timeout safety
      setTimeout(() => {
        reject(new Error('Download timed out after 30 seconds'));
      }, 30000);
      
    } catch (error) {
      reject(error);
    }
  });
}

// Method 2: Direct download from info.formats[].url
async function directDownloadMethod(videoId: string, requestId: string): Promise<AudioResult> {
  console.log(`[alt-transcode:directDownload][${requestId}] Getting video info for ${videoId}`);
  
  const userAgent = getRandomUserAgent();
  const proxy = getRandomProxy();
  
  // Retry info fetching with multiple user agents
  let info;
  let retries = 3;
  
  while (retries > 0) {
    try {
      info = await ytdl.getInfo(videoId, {
        requestOptions: {
          headers: getBrowserHeaders(userAgent),
          agent: createProxyAgent(proxy)
        }
      });
      break;
    } catch (error) {
      retries--;
      if (retries === 0) throw error;
      await sleep(1000);
    }
  }
  
  if (!info) {
    throw new Error('Failed to get video info');
  }
  
  // Find the best audio format
  const formats = ytdl.filterFormats(info.formats, 'audioonly');
  const format = formats.sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0))[0];
  
  if (!format || !format.url) {
    throw new Error('No suitable audio format found');
  }
  
  console.log(`[alt-transcode:directDownload][${requestId}] Found best format: ${format.mimeType}, itag: ${format.itag}`);
  console.log(`[alt-transcode:directDownload][${requestId}] Downloading from direct URL`);
  
  // Download the audio using the direct format URL
  const fetchOptions = {
    headers: getBrowserHeaders(userAgent, 'https://www.youtube.com/watch?v=' + videoId),
    agent: createProxyAgent(proxy),
    ...getProxyFetchOptions(proxy)
  };
  
  const response = await fetch(format.url, fetchOptions);
  
  if (!response.ok) {
    throw new Error(`HTTP error ${response.status}`);
  }
  
  const buffer = await response.buffer();
  return {
    buffer,
    size: buffer.length,
    mimeType: format.mimeType?.split(';')[0] || 'audio/mp4'
  };
}

// Method 3: Standard ytdl method with custom agent
async function standardYtdlMethod(videoId: string, requestId: string): Promise<AudioResult> {
  const userAgent = getRandomUserAgent();
  const proxy = getRandomProxy();
  
  // Setup ytdl options
  const options = {
    quality: 'highestaudio',
    filter: 'audioonly' as ytdl.Filter,
    requestOptions: {
      headers: getBrowserHeaders(userAgent),
      agent: createProxyAgent(proxy)
    }
  };
  
  return new Promise((resolve, reject) => {
    try {
      const stream = ytdl(`https://www.youtube.com/watch?v=${videoId}`, options);
      const chunks: Buffer[] = [];
      let totalLength = 0;
      let mimeType = 'audio/mp4';
      
      stream.on('info', (info, format) => {
        if (format && format.mimeType) {
          mimeType = format.mimeType.split(';')[0];
        }
      });
      
      stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
        totalLength += chunk.length;
      });
      
      stream.on('end', () => {
        const buffer = Buffer.concat(chunks, totalLength);
        resolve({
          buffer,
          size: buffer.length,
          mimeType
        });
      });
      
      stream.on('error', (error) => {
        reject(error);
      });
    } catch (error) {
      reject(error);
    }
  });
}

// Method 4: Fallback method using different settings
async function fallbackYtdlMethod(videoId: string, requestId: string): Promise<AudioResult> {
  const userAgent = getRandomUserAgent();
  const proxy = getRandomProxy();
  
  // Uses a different itag approach to try to bypass restrictions
  const options = {
    quality: 'lowestaudio', // Try lowest quality as it might have fewer restrictions
    filter: 'audioonly' as ytdl.Filter,
    requestOptions: {
      headers: {
        ...getBrowserHeaders(userAgent),
        // Add random X-Forwarded-For to potentially bypass IP restrictions
        'X-Forwarded-For': `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
      },
      agent: createProxyAgent(proxy)
    }
  };
  
  return new Promise((resolve, reject) => {
    try {
      console.log(`[alt-transcode:fallback][${requestId}] Trying fallback method with lowest quality`);
      
      const stream = ytdl(`https://www.youtube.com/watch?v=${videoId}`, options);
      const chunks: Buffer[] = [];
      let totalLength = 0;
      let mimeType = 'audio/mp4';
      
      stream.on('info', (info, format) => {
        if (format && format.mimeType) {
          mimeType = format.mimeType.split(';')[0];
          console.log(`[alt-transcode:fallback][${requestId}] Got format info: ${mimeType}, itag: ${format.itag}`);
        }
      });
      
      stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
        totalLength += chunk.length;
      });
      
      stream.on('end', () => {
        if (totalLength === 0) {
          return reject(new Error('Zero bytes received in fallback method'));
        }
        
        const buffer = Buffer.concat(chunks, totalLength);
        resolve({
          buffer,
          size: buffer.length,
          mimeType
        });
      });
      
      stream.on('error', (error) => {
        reject(error);
      });
      
      // Add timeout safety
      setTimeout(() => {
        reject(new Error('Fallback download timed out after 30 seconds'));
      }, 30000);
      
    } catch (error) {
      reject(error);
    }
  });
} 