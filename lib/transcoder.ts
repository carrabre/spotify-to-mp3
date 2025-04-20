import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { retry, sleep } from './utils';

/**
 * Optimized transcoder module for Vercel Pro environment
 * This handles YouTube video transcoding to MP3 format
 */

// Get yt-dlp path from environment or use default
const YT_DLP_PATH = process.env.YT_DLP_PATH || '/opt/homebrew/bin/yt-dlp';

// Interface for transcoded audio data
interface TranscodedAudio {
  buffer: Buffer;
  size: number;
  mimeType: string;
}

/**
 * Transcode a YouTube video to MP3 format
 * Optimized for Vercel Pro serverless functions
 * 
 * @param videoId YouTube video ID
 * @returns Promise with transcoded audio data
 */
export async function transcodeYouTubeVideo(videoId: string): Promise<TranscodedAudio> {
  const startTime = Date.now();
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const tempFile = path.join(os.tmpdir(), `${videoId}-${Date.now()}.mp3`);

  console.log(`[Transcode][${videoId}] Starting transcode process at ${new Date().toISOString()}`);
  console.log(`[Transcode][${videoId}] System info:`, {
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    tempDir: os.tmpdir(),
    freeMem: os.freemem(),
    totalMem: os.totalmem(),
    ytDlpPath: YT_DLP_PATH,
    ytDlpExists: fs.existsSync(YT_DLP_PATH)
  });

  try {
    // Retry the transcoding process up to 2 times with exponential backoff
    return await retry(async () => {
      try {
        console.log(`[Transcode][${videoId}] Starting yt-dlp download...`);
        
        // Check if yt-dlp exists
        if (!fs.existsSync(YT_DLP_PATH)) {
          throw new Error(`yt-dlp not found at path: ${YT_DLP_PATH}`);
        }

        // Use yt-dlp to download and convert to mp3 directly
        // Optimized flags for Vercel serverless environment
        const ytDlpProcess = spawn(YT_DLP_PATH, [
          videoUrl,
          '--extract-audio',
          '--audio-format', 'mp3',
          '--audio-quality', '0',
          '--output', tempFile,
          '--no-check-certificate',
          '--no-warnings',
          '--prefer-free-formats',
          '--add-header', 'referer:youtube.com',
          // Additional optimizations for Vercel
          '--no-playlist',
          '--no-cache-dir', 
          '--no-progress',
          '--quiet'
        ]);

        // Collect stdout for debugging
        let stdoutData = '';
        ytDlpProcess.stdout.on('data', (data) => {
          stdoutData += data.toString();
          console.log(`[Transcode][${videoId}] yt-dlp stdout: ${data}`);
        });

        // Collect stderr for debugging
        let stderrData = '';
        ytDlpProcess.stderr.on('data', (data) => {
          stderrData += data.toString();
          console.error(`[Transcode][${videoId}] yt-dlp stderr: ${data}`);
        });

        // Wait for the process to complete
        const exitCode = await new Promise<number>((resolve) => {
          ytDlpProcess.on('close', resolve);
        });

        console.log(`[Transcode][${videoId}] yt-dlp process exited with code ${exitCode}`);

        if (exitCode !== 0) {
          throw new Error(`yt-dlp process failed with exit code ${exitCode}. stderr: ${stderrData}`);
        }

        // Verify the file exists and get its stats
        if (!fs.existsSync(tempFile)) {
          throw new Error(`Output file does not exist at ${tempFile}`);
        }

        const stats = fs.statSync(tempFile);
        console.log(`[Transcode][${videoId}] Output file stats:`, {
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime
        });

        if (stats.size === 0) {
          throw new Error('Output file is empty');
        }

        // Read the file
        const buffer = fs.readFileSync(tempFile);
        console.log(`[Transcode][${videoId}] Read ${buffer.length} bytes from output file`);

        const duration = Date.now() - startTime;
        console.log(`[Transcode][${videoId}] Complete! Duration: ${duration}ms`);

        // Clean up the temp file
        try {
          fs.unlinkSync(tempFile);
          console.log(`[Transcode][${videoId}] Successfully deleted temp file: ${tempFile}`);
        } catch (unlinkError) {
          console.error(`[Transcode][${videoId}] Error deleting temp file:`, {
            path: tempFile,
            error: unlinkError instanceof Error ? unlinkError.message : String(unlinkError),
            code: unlinkError instanceof Error && 'code' in unlinkError ? (unlinkError as any).code : undefined
          });
        }

        return {
          buffer,
          size: buffer.length,
          mimeType: 'audio/mpeg'
        };
      } catch (error) {
        // Clean up temp file if it exists
        if (fs.existsSync(tempFile)) {
          try {
            fs.unlinkSync(tempFile);
          } catch (unlinkError) {
            console.error(`[Transcode][${videoId}] Error cleaning up temp file during error recovery:`, unlinkError);
          }
        }
        
        throw error;
      }
    }, 2, 2000); // Retry up to 2 times with initial 2s delay
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[Transcode][${videoId}] Process failed after ${duration}ms:`, {
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : String(error),
      tempFileExists: fs.existsSync(tempFile)
    });

    // Clean up temp file if it exists
    if (fs.existsSync(tempFile)) {
      try {
        fs.unlinkSync(tempFile);
      } catch (unlinkError) {
        console.error(`[Transcode][${videoId}] Final cleanup error:`, unlinkError);
      }
    }

    throw error;
  }
} 