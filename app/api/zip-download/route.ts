import { type NextRequest, NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import os from "os"
import JSZip from "jszip"
import YTDlpWrap from "yt-dlp-wrap"
import ffmpegStatic from "ffmpeg-static"
import { Readable } from "stream"

// Set ffmpeg path for yt-dlp to use
process.env.FFMPEG_PATH = ffmpegStatic || process.env.FFMPEG_PATH

// Configure yt-dlp binary path
let ytDlpBinaryPath: string | undefined
// Try to find yt-dlp in various locations
if (fs.existsSync("./.vercel/bin/yt-dlp")) {
  ytDlpBinaryPath = path.resolve("./.vercel/bin/yt-dlp")
} else if (process.env.PATH) {
  // Look for yt-dlp in PATH
  const pathDirs = process.env.PATH.split(path.delimiter)
  for (const dir of pathDirs) {
    const possiblePath = path.join(dir, "yt-dlp")
    if (fs.existsSync(possiblePath)) {
      ytDlpBinaryPath = possiblePath
      break
    }
  }
}

// Configuration constants for safe limits
const MAX_TRACKS_PER_BATCH = 50  // Max number of tracks to process in a batch
const MAX_ZIP_SIZE_MB = 2000     // Max ZIP size in MB (keeping it under 2GB for safety)
const MAX_MEMORY_USAGE_MB = 2800 // Max memory usage threshold in MB (under the 3009MB limit)

// Log configuration for debugging
console.log("YT-DLP Path (ZIP):", ytDlpBinaryPath || "Using default from yt-dlp-wrap")
console.log("FFMPEG Path (ZIP):", process.env.FFMPEG_PATH || "Not set")

// Function to monitor memory usage
function logMemoryUsage(label: string) {
  const memoryUsage = process.memoryUsage()
  const memUsageMB = {
    rss: Math.round(memoryUsage.rss / 1024 / 1024),
    heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
    heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
    external: Math.round(memoryUsage.external / 1024 / 1024),
    arrayBuffers: Math.round(memoryUsage.arrayBuffers / 1024 / 1024),
  };
  
  console.log(`Memory Usage (ZIP ${label}):`, {
    rss: `${memUsageMB.rss}MB`, // Resident Set Size
    heapTotal: `${memUsageMB.heapTotal}MB`, // Total Size of the Heap
    heapUsed: `${memUsageMB.heapUsed}MB`, // Heap actually Used
    external: `${memUsageMB.external}MB`, // Memory used by C++ objects bound to JS
    arrayBuffers: `${memUsageMB.arrayBuffers}MB`, // Memory allocated for ArrayBuffers and SharedArrayBuffers
    percentUsed: `${Math.round((memUsageMB.rss / 3009) * 100)}%`, // Percentage of available memory used
  })
  
  // Warn if memory usage is high
  if (memUsageMB.rss > 2700) {
    console.warn(`⚠️ ZIP HIGH MEMORY USAGE: ${memUsageMB.rss}MB / 3009MB (${Math.round((memUsageMB.rss / 3009) * 100)}%)`)
  }
  
  return memUsageMB;
}

// Track request durations
function startRequestTimer() {
  const startTime = Date.now();
  return {
    getElapsedTime: () => {
      const elapsed = Date.now() - startTime;
      return {
        ms: elapsed,
        seconds: Math.round(elapsed / 1000),
        pretty: `${Math.round(elapsed / 1000)}s`
      };
    }
  };
}

// Check if memory usage is approaching limit
function isMemoryApproachingLimit() {
  const memoryUsage = process.memoryUsage()
  const memoryUsageMB = memoryUsage.rss / (1024 * 1024)
  return memoryUsageMB > MAX_MEMORY_USAGE_MB
}

export async function POST(request: NextRequest) {
  const requestId = Date.now().toString();
  const timer = startRequestTimer();
  console.log(`[ZIP-${requestId}] Starting ZIP download request`);
  
  logMemoryUsage(`[${requestId}] Start of request`);
  
  try {
    const data = await request.json()
    const { tracks, batchSize: requestedBatchSize } = data

    console.log(`[ZIP-${requestId}] Received request for ${tracks?.length || 0} tracks`);

    if (!tracks || !Array.isArray(tracks) || tracks.length === 0) {
      return NextResponse.json({ error: "No tracks provided" }, { status: 400 })
    }

    // Determine if we need to process in batches (for large playlists)
    const batchSize = Math.min(
      requestedBatchSize || MAX_TRACKS_PER_BATCH, 
      MAX_TRACKS_PER_BATCH
    )
    
    // For extremely large playlists, recommend client-side batching
    if (tracks.length > 200) {
      console.log(`[ZIP-${requestId}] Large playlist detected with ${tracks.length} tracks. Recommending client-side batching.`)
      
      if (!requestedBatchSize) {
        return NextResponse.json({
          error: "Playlist too large for single download",
          message: "This playlist is too large to download at once. Please download in smaller batches.",
          recommendation: "Split the playlist into smaller batches",
          trackCount: tracks.length,
          recommendedBatchSize: MAX_TRACKS_PER_BATCH,
          code: "PLAYLIST_TOO_LARGE"
        }, { status: 413 }) // 413 Payload Too Large
      }
    }

    // Log all available information about the environment
    console.log(`[ZIP-${requestId}] Environment:`, {
      platform: process.platform,
      architecture: process.arch,
      nodeVersion: process.version,
      currentDirectory: process.cwd(),
      tempDir: os.tmpdir(),
      homeDir: os.homedir(),
      vercelEnv: process.env.VERCEL_ENV || "not set",
      vercelRegion: process.env.VERCEL_REGION || "not set",
    })

    // Create a temporary directory for downloads
    const tempDir = path.join(os.tmpdir(), "spotify-to-mp3-zip-downloads")

    // Ensure the directory exists
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }

    // Create a new ZIP file
    const zip = new JSZip()

    // Track successful downloads
    let successCount = 0
    let failCount = 0
    const errors = []
    let totalZipSizeMB = 0
    let totalDownloadSizeMB = 0

    // Initialize yt-dlp-wrap with the binary path if available
    const ytDlp = ytDlpBinaryPath ? new YTDlpWrap(ytDlpBinaryPath) : new YTDlpWrap()

    logMemoryUsage(`[${requestId}] Before downloads`);

    // Determine tracks to process based on batch size
    const tracksToProcess = tracks.slice(0, batchSize);
    console.log(`[ZIP-${requestId}] Processing ${tracksToProcess.length} out of ${tracks.length} tracks`);

    // Download each track and add to ZIP
    for (let i = 0; i < tracksToProcess.length; i++) {
      const track = tracksToProcess[i];
      if (!track.youtubeId) continue;

      const trackTimer = startRequestTimer();
      console.log(`[ZIP-${requestId}] Processing track ${i + 1}/${tracksToProcess.length}: ${track.name}`);

      // Log memory more frequently for larger playlists
      if (i % 3 === 0 || i > 20) {
        const memUsage = logMemoryUsage(`[${requestId}] Processing track ${i + 1}/${tracksToProcess.length}`);
        
        // Check if memory usage is approaching limit
        if (isMemoryApproachingLimit()) {
          console.warn(`[ZIP-${requestId}] Memory usage approaching limit (${memUsage.rss}MB). Stopping batch processing.`);
          break;
        }
      }

      try {
        // Create a sanitized filename
        const sanitizedFilename = `${track.name.replace(/[^a-z0-9]/gi, "_")}${
          track.artists ? "_" + track.artists.join("_").replace(/[^a-z0-9]/gi, "_") : ""
        }.mp3`;

        // YouTube URL from video ID
        const youtubeUrl = `https://www.youtube.com/watch?v=${track.youtubeId}`;

        // Create the output path
        const outputPath = path.join(tempDir, `${track.youtubeId}_${sanitizedFilename}`);

        console.log(`[ZIP-${requestId}] Downloading ${track.name} to ${outputPath}`);

        // Download the track using yt-dlp-wrap
        const downloadStartTime = Date.now();
        await ytDlp.execPromise([
          youtubeUrl,
          "-f",
          "bestaudio",
          "-x",
          "--audio-format",
          "mp3",
          "--audio-quality",
          "0",
          "--embed-metadata",
          "--ffmpeg-location",
          (process.env.FFMPEG_PATH as string) || ffmpegStatic as string,
          "-o",
          outputPath,
          "--no-playlist",
          "--no-warnings",
          "--verbose",
        ]);
        
        const downloadDuration = Math.round((Date.now() - downloadStartTime) / 1000);
        console.log(`[ZIP-${requestId}] Downloaded track ${i + 1} in ${downloadDuration}s`);

        // Check if the file exists and has content
        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
          // Get file size
          const stats = fs.statSync(outputPath);
          const fileSize = stats.size / (1024 * 1024); // Convert to MB
          totalZipSizeMB += fileSize;
          totalDownloadSizeMB += fileSize;
          
          console.log(`[ZIP-${requestId}] Track ${i + 1} size: ${fileSize.toFixed(2)}MB, total so far: ${totalZipSizeMB.toFixed(2)}MB`);
          
          // Check if adding this file would exceed our ZIP size limit
          if (totalZipSizeMB > MAX_ZIP_SIZE_MB) {
            console.warn(`[ZIP-${requestId}] ZIP file size limit approaching (${totalZipSizeMB.toFixed(2)}MB). Skipping remaining tracks.`);
            // We'll keep this file but stop processing more
            fs.readFileSync(outputPath);
            zip.file(sanitizedFilename, fs.readFileSync(outputPath));
            successCount++;
            
            // Clean up the file
            try {
              fs.unlinkSync(outputPath);
            } catch (unlinkError) {
              console.error(`[ZIP-${requestId}] Error deleting temporary file ${outputPath}:`, unlinkError);
            }
            
            break;
          }
          
          // Read the file and add to ZIP
          const fileData = fs.readFileSync(outputPath);
          zip.file(sanitizedFilename, fileData);

          // Delete the temporary file
          try {
            fs.unlinkSync(outputPath);
          } catch (unlinkError) {
            console.error(`[ZIP-${requestId}] Error deleting temporary file ${outputPath}:`, unlinkError);
          }

          successCount++;
          console.log(`[ZIP-${requestId}] Track ${i + 1}/${tracksToProcess.length} processed in ${trackTimer.getElapsedTime().pretty}`);
        } else {
          throw new Error(`Downloaded file is empty or does not exist: ${outputPath}`);
        }
      } catch (error) {
        console.error(`[ZIP-${requestId}] Error downloading track ${track.name}:`, error);
        
        // Check if error is memory-related
        if (error instanceof Error) {
          const errorMessage = error.message.toLowerCase();
          if (errorMessage.includes("memory") || errorMessage.includes("allocation") || errorMessage.includes("heap")) {
            console.error(`[ZIP-${requestId}] Memory-related error detected:`, error);
            logMemoryUsage(`[${requestId}] Memory error on track ${i + 1}`);
            // Break the loop to prevent further memory issues
            break;
          }
        }
        
        errors.push({
          track: track.name,
          error: error instanceof Error ? error.message : String(error),
        });
        failCount++;
        // Continue with other tracks even if one fails
      }
    }

    logMemoryUsage(`[${requestId}] After all downloads`);
    console.log(`[ZIP-${requestId}] Download phase complete: ${successCount} successful, ${failCount} failed, ${totalDownloadSizeMB.toFixed(2)}MB downloaded`);

    // If all downloads failed, return an error
    if (successCount === 0 && failCount > 0) {
      return NextResponse.json(
        {
          error: "Failed to download any tracks. Please try downloading them individually.",
          details: errors,
        },
        { status: 500 },
      );
    }

    // Generate the ZIP file
    console.log(`[ZIP-${requestId}] Starting ZIP generation for ${successCount} tracks`);
    logMemoryUsage(`[${requestId}] Before ZIP generation`);
    
    const zipTimer = startRequestTimer();
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
    const zipGenerationTime = zipTimer.getElapsedTime();
    
    logMemoryUsage(`[${requestId}] After ZIP generation`);

    const zipSizeMB = Math.round(zipBuffer.length / 1024 / 1024);
    console.log(`[ZIP-${requestId}] ZIP file generated in ${zipGenerationTime.pretty}. Size: ${zipSizeMB}MB`);

    // Set headers for file download
    const headers = new Headers();
    headers.set("Content-Disposition", `attachment; filename="spotify-tracks.zip"`);
    headers.set("Content-Type", "application/zip");
    headers.set("Content-Length", zipBuffer.length.toString());

    // Add information about batch processing
    if (tracks.length > tracksToProcess.length) {
      const batchInfo = JSON.stringify({
        totalTracks: tracks.length,
        processedTracks: tracksToProcess.length,
        successfulTracks: successCount,
        failedTracks: failCount,
        zipSizeMB: zipSizeMB,
        moreTracksAvailable: true
      });
      
      headers.set("X-Batch-Info", batchInfo);
      console.log(`[ZIP-${requestId}] Batch info: ${batchInfo}`);
    }

    // Convert buffer to stream
    const readable = new Readable();
    readable.push(zipBuffer);
    readable.push(null);
    const readableStream = Readable.toWeb(readable) as ReadableStream;

    logMemoryUsage(`[${requestId}] Before sending response`);
    console.log(`[ZIP-${requestId}] Total request processing time: ${timer.getElapsedTime().pretty}`);

    return new NextResponse(readableStream, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error(`[ZIP-${requestId}] Error creating ZIP file:`, error);
    
    // Check if error is memory-related
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();
      if (errorMessage.includes("memory") || errorMessage.includes("allocation") || errorMessage.includes("heap")) {
        console.error(`[ZIP-${requestId}] Memory-related error detected:`, error);
        logMemoryUsage(`[${requestId}] Memory error in ZIP creation`);
      }
    }
    
    return NextResponse.json(
      {
        error: "Failed to create ZIP file",
        details: error instanceof Error ? error.message : String(error),
        requestId: requestId,
      },
      { status: 500 },
    );
  }
}
