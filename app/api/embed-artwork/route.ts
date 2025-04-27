import { NextRequest, NextResponse } from 'next/server';
import NodeID3, { Tags as NodeID3Tags } from 'node-id3';
import { Buffer } from 'buffer';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { promisify } from 'util';
import { execFile } from 'child_process';

const execFileAsync = promisify(execFile);

// Enable debug mode for detailed logging
const DEBUG_MODE = true;

// Define proper TypeScript interfaces for the node-id3 library
interface ImageTag {
  mime: string;
  type: {
    id: number;
    name: string;
  };
  description: string;
  imageBuffer: Buffer;
}

// Define the APIC frame format according to node-id3 documentation
interface APICFrame {
  imageBuffer: Buffer;
  type: {
    id: number;
    name: string;
  };
  description: string;
  mime: string;
}

// Properly extend the NodeID3Tags type to support our custom properties
type Tags = NodeID3Tags & {
  image?: ImageTag | string;
  APIC?: APICFrame | string;
  raw?: {
    APIC?: any;
    [key: string]: any;
  };
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60 seconds for processing

// Helper function to check if buffer is a valid MP3
function isValidMP3(buffer: Buffer): boolean {
  // Check for MP3 frame sync (0xFF followed by 0xE0 to 0xFF)
  const hasMp3Header = buffer.length >= 2 &&
    buffer[0] === 0xFF &&
    (buffer[1] & 0xE0) === 0xE0;
    
  return hasMp3Header;
}

// Helper function to guess the MIME type from image buffer
function guessImageMimeType(buffer: Buffer): string {
  // Check for common image format headers
  if (buffer.length >= 3 && 
      buffer[0] === 0xFF && 
      buffer[1] === 0xD8 && 
      buffer[2] === 0xFF) {
    return 'image/jpeg';
  }
  
  if (buffer.length >= 8 &&
      buffer[0] === 0x89 && 
      buffer[1] === 0x50 && 
      buffer[2] === 0x4E && 
      buffer[3] === 0x47 &&
      buffer[4] === 0x0D && 
      buffer[5] === 0x0A &&
      buffer[6] === 0x1A && 
      buffer[7] === 0x0A) {
    return 'image/png';
  }
  
  // Default to JPEG which is most common for album art
  return 'image/jpeg';
}

// Handle the multipart form data from the client and embed album artwork
export async function POST(request: NextRequest) {
  console.log(`[EmbedArtwork] Processing request - START`);
  
  try {
    // Parse the multipart form data
    const formData = await request.formData();
    console.log(`[EmbedArtwork] FormData parsed successfully`);
    console.log(`[EmbedArtwork] FormData keys: ${Array.from(formData.keys()).join(', ')}`);
    
    // Get file and metadata with detailed logging - try multiple possible field names
    const audioFile = formData.get('audio') || formData.get('audioFile') || formData.get('file');
    
    if (DEBUG_MODE) {
      console.log(`[EmbedArtwork] Received request to embed artwork`);
      console.log(`[EmbedArtwork] Audio file: ${audioFile ? 'present' : 'missing'}`);
      console.log(`[EmbedArtwork] Audio file type: ${audioFile ? typeof audioFile : 'N/A'}`);
      console.log(`[EmbedArtwork] Form data keys available: ${Array.from(formData.keys()).join(', ')}`);
      console.log(`[EmbedArtwork] Audio file constructor: ${audioFile ? audioFile.constructor.name : 'N/A'}`);
      console.log(`[EmbedArtwork] Audio file instanceof Blob: ${audioFile instanceof Blob}`);
      
      // Additional logging to diagnose File vs Blob issues
      if (typeof File !== 'undefined') {
        console.log(`[EmbedArtwork] File global is defined`);
        console.log(`[EmbedArtwork] Audio file instanceof File: ${audioFile instanceof File}`);
      } else {
        console.log(`[EmbedArtwork] File global is NOT defined in this environment (Node.js server-side)`);
      }
      
      if (audioFile) {
        try {
          const prototypeNames = Object.getOwnPropertyNames(Object.getPrototypeOf(audioFile));
          console.log(`[EmbedArtwork] Audio file properties: ${JSON.stringify(prototypeNames)}`);
        } catch (err) {
          console.log(`[EmbedArtwork] Could not get audio file properties: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else {
        console.log(`[EmbedArtwork] Audio file properties: N/A`);
      }
      
      if (audioFile && 'size' in audioFile) {
        console.log(`[EmbedArtwork] Audio file size: ${(audioFile as any).size} bytes`);
      }
    }
    
    // Verify we have a valid audio file
    if (!audioFile) {
      console.error(`[EmbedArtwork] Missing audio file in request`);
      return NextResponse.json({ error: 'Failed to embed artwork', details: 'File is not defined' }, { status: 400 });
    }
    
    // Make sure it's a valid object that can be converted to ArrayBuffer
    if (!(audioFile instanceof Blob)) {
      console.error(`[EmbedArtwork] Audio file is not a Blob: ${typeof audioFile}`);
      return NextResponse.json({ 
        error: 'Failed to embed artwork', 
        details: `Expected Blob, got ${typeof audioFile} (${audioFile.constructor.name})`
      }, { status: 400 });
    }
    
    // Safely check if the object has an arrayBuffer method
    if (typeof (audioFile as any).arrayBuffer !== 'function') {
      console.error(`[EmbedArtwork] Audio file doesn't have a valid arrayBuffer method`);
      return NextResponse.json({ 
        error: 'Failed to embed artwork', 
        details: 'Audio file object does not support arrayBuffer method'
      }, { status: 400 });
    }
    
    // Log file size for debugging
    if ('size' in audioFile) {
      console.log(`[EmbedArtwork] Audio file size: ${(audioFile as Blob).size} bytes`);
      
      // Additional basic validation
      if ((audioFile as Blob).size < 1000) {
        console.error(`[EmbedArtwork] Audio file too small (${(audioFile as Blob).size} bytes), likely invalid`);
        return NextResponse.json({ 
          error: 'Failed to embed artwork', 
          details: 'Audio file is too small to be valid'
        }, { status: 400 });
      }
    } else {
      console.warn(`[EmbedArtwork] Cannot determine audio file size - missing size property`);
    }
    
    const trackName = formData.get('trackName') as string;
    const artistName = formData.get('artistName') as string;
    const albumName = formData.get('albumName') as string;
    const albumImageUrl = formData.get('albumImageUrl') as string;
    
    console.log(`[EmbedArtwork] Track metadata: "${trackName}" by ${artistName}, album: ${albumName}`);
    console.log(`[EmbedArtwork] Album image URL: ${albumImageUrl}`);
    
    // Check where the image is coming from
    const isSpotifyImage = albumImageUrl.includes('scdn.co') || albumImageUrl.includes('spotify.com');
    const isAppleImage = albumImageUrl.includes('apple') || albumImageUrl.includes('mzstatic');
    
    console.log(`[EmbedArtwork] Image source: ${isSpotifyImage ? 'Spotify' : isAppleImage ? 'Apple Music' : 'Unknown source'}`);
    
    // Verify the image URL is valid
    if (!albumImageUrl) {
      console.error(`[EmbedArtwork] Missing album image URL`);
      return NextResponse.json({ error: 'Missing album image URL' }, { status: 400 });
    }
    
    // Get the audio as array buffer
    console.log(`[EmbedArtwork] Converting audio to buffer`);
    let audioArrayBuffer;
    try {
      audioArrayBuffer = await audioFile.arrayBuffer();
      console.log(`[EmbedArtwork] Successfully converted to ArrayBuffer, size: ${audioArrayBuffer.byteLength} bytes`);
    } catch (bufferError) {
      console.error(`[EmbedArtwork] Error converting to ArrayBuffer:`, bufferError);
      return NextResponse.json({ 
        error: 'Failed to embed artwork', 
        details: `Error processing audio: ${bufferError instanceof Error ? bufferError.message : String(bufferError)}`
      }, { status: 400 });
    }
    
    const audioBuffer = Buffer.from(audioArrayBuffer);
    console.log(`[EmbedArtwork] Audio buffer created, size: ${audioBuffer.length} bytes`);
    
    // Basic validation of audio buffer
    if (audioBuffer.length < 1024) {
      console.error(`[EmbedArtwork] Audio buffer too small (${audioBuffer.length} bytes), likely invalid`);
      return NextResponse.json({ 
        error: 'Failed to embed artwork', 
        details: 'Audio file is too small to be valid'
      }, { status: 400 });
    }
    
    if (!isValidMP3(audioBuffer)) {
      console.warn(`[EmbedArtwork] Buffer does not appear to be a valid MP3 file, continuing anyway`);
    }
    
    // Download the album artwork
    console.log(`[EmbedArtwork] Downloading album artwork from: ${albumImageUrl}`);
    const artworkDownloadStart = Date.now();
    
    let artworkResponse;
    try {
      artworkResponse = await fetch(albumImageUrl);
      
      if (!artworkResponse.ok) {
        console.error(`[EmbedArtwork] Failed to download artwork: HTTP ${artworkResponse.status}`);
        throw new Error(`Artwork download failed with status ${artworkResponse.status}`);
      }
      
      const artworkDownloadDuration = Date.now() - artworkDownloadStart;
      console.log(`[EmbedArtwork] Artwork downloaded successfully in ${artworkDownloadDuration}ms`);
      
      // Get content type and size for logging
      const contentType = artworkResponse.headers.get('content-type');
      const contentLength = artworkResponse.headers.get('content-length');
      console.log(`[EmbedArtwork] Artwork details - Type: ${contentType}, Size: ${contentLength || 'unknown'} bytes`);
      
    } catch (error) {
      console.error(`[EmbedArtwork] Error downloading artwork:`, error);
      return NextResponse.json({
        error: 'Failed to download album artwork',
        details: error instanceof Error ? error.message : String(error)
      }, { status: 500 });
    }
    
    // Convert artwork to buffer
    const artworkBuffer = await artworkResponse.arrayBuffer();
    console.log(`[EmbedArtwork] Artwork loaded as ArrayBuffer, size: ${artworkBuffer.byteLength} bytes`);
    
    // Get the image data
    const imageBuffer = Buffer.from(artworkBuffer);
    
    const imageMimeType = guessImageMimeType(imageBuffer);
    console.log(`[EmbedArtwork] Artwork fetched, size: ${imageBuffer.length} bytes, type: ${imageMimeType}`);
    
    // Create temp filenames
    const tempDir = os.tmpdir();
    const timestamp = new Date().getTime();
    const tempAudioFile = path.join(tempDir, `audio-${timestamp}.mp3`);
    const tempImageFile = path.join(tempDir, `cover-${timestamp}.jpg`);
    const outputFile = path.join(tempDir, `output-${timestamp}.mp3`);
    
    console.log(`[EmbedArtwork] Created temp file paths:`);
    console.log(`[EmbedArtwork] - Audio: ${tempAudioFile}`);
    console.log(`[EmbedArtwork] - Image: ${tempImageFile}`);
    console.log(`[EmbedArtwork] - Output: ${outputFile}`);
    
    try {
      // Save the files
      console.log(`[EmbedArtwork] Saving audio to temp file`);
      fs.writeFileSync(tempAudioFile, audioBuffer);
      console.log(`[EmbedArtwork] Audio saved to ${tempAudioFile}, size: ${fs.statSync(tempAudioFile).size} bytes`);
      
      console.log(`[EmbedArtwork] Saving image to temp file`);
      fs.writeFileSync(tempImageFile, imageBuffer);
      console.log(`[EmbedArtwork] Image saved to ${tempImageFile}, size: ${fs.statSync(tempImageFile).size} bytes`);
      
      let success = false;
      let processedBuffer: Buffer = audioBuffer; // Default to original
      
      // Try multiple methods in sequence until one succeeds
      
      // Method 1: Use NodeID3 with file-based approach
      console.log(`[EmbedArtwork] ATTEMPT METHOD 1: NodeID3 file-based approach`);
      try {
        // First remove any existing tags to avoid conflicts
        console.log(`[EmbedArtwork] Removing existing ID3 tags`);
        NodeID3.removeTags(tempAudioFile);
        
        // Create tags according to the NodeID3 documentation
        console.log(`[EmbedArtwork] Creating ID3 tags with image path`);
        const tags: Tags = {
          title: trackName,
          artist: artistName,
          album: albumName,
          // Use the string path format directly - this is one valid way according to the docs
          image: tempImageFile
        };
        
        // Write tags according to docs
        console.log(`[EmbedArtwork] Writing ID3 tags to file`);
        const writeResult = NodeID3.write(tags, tempAudioFile);
        console.log(`[EmbedArtwork] NodeID3 write result:`, writeResult);
        
        // Verify the result
        console.log(`[EmbedArtwork] Verifying tags were written`);
        const readTags = NodeID3.read(tempAudioFile) as Tags | null;
        console.log(`[EmbedArtwork] Read tags:`, readTags ? 'Success' : 'Failed');
        console.log(`[EmbedArtwork] Has image:`, readTags && (readTags.image || readTags.raw?.APIC) ? 'Yes' : 'No');
        
        if (readTags && (readTags.image || readTags.raw?.APIC)) {
          console.log(`[EmbedArtwork] Method 1: NodeID3 tags successfully verified`);
          success = true;
          processedBuffer = fs.readFileSync(tempAudioFile);
          console.log(`[EmbedArtwork] Read processed file, size: ${processedBuffer.length} bytes`);
        } else {
          console.log(`[EmbedArtwork] Method 1: NodeID3 verification failed, tags not found`);
        }
      } catch (nodeID3Error) {
        console.error(`[EmbedArtwork] Method 1 failed with error:`, nodeID3Error);
      }
      
      // Method 2: Use ffmpeg if available and Method 1 failed
      if (!success) {
        console.log(`[EmbedArtwork] ATTEMPT METHOD 2: ffmpeg approach`);
        try {
          // Check if ffmpeg is installed
          console.log(`[EmbedArtwork] Checking if ffmpeg is available`);
          try {
            const ffmpegVersionResult = await execFileAsync('ffmpeg', ['-version']);
            console.log(`[EmbedArtwork] ffmpeg is available: ${ffmpegVersionResult.stdout.substring(0, 50)}...`);
          } catch (ffmpegCheckError) {
            console.error(`[EmbedArtwork] ffmpeg not available:`, ffmpegCheckError);
            throw new Error('ffmpeg not available');
          }
          
          // Use ffmpeg to embed cover art with multiple metadata formats for compatibility
          console.log(`[EmbedArtwork] Running ffmpeg command to embed artwork`);
          const ffmpegArgs = [
            '-i', tempAudioFile,
            '-i', tempImageFile,
            '-map', '0:0',
            '-map', '1:0',
            '-c', 'copy',
            '-id3v2_version', '3',
            '-metadata:s:v', 'title=Album cover',
            '-metadata:s:v', 'comment=Cover (front)',
            '-metadata', `title=${trackName}`,
            '-metadata', `artist=${artistName}`,
            '-metadata', `album=${albumName}`,
            // Force artwork attachment as cover art
            '-disposition:v', 'attached_pic',
            outputFile
          ];
          
          console.log(`[EmbedArtwork] ffmpeg command:`, 'ffmpeg', ffmpegArgs.join(' '));
          const ffmpegResult = await execFileAsync('ffmpeg', ffmpegArgs);
          console.log(`[EmbedArtwork] ffmpeg execution complete`);
          
          if (fs.existsSync(outputFile)) {
            const outputStats = fs.statSync(outputFile);
            console.log(`[EmbedArtwork] ffmpeg output file exists, size: ${outputStats.size} bytes`);
            
            // Only use the output if it's a reasonable size
            if (outputStats.size > audioBuffer.length * 0.9) {
              success = true;
              processedBuffer = fs.readFileSync(outputFile);
              console.log(`[EmbedArtwork] Method 2: ffmpeg processing successful, output size: ${processedBuffer.length} bytes`);
            } else {
              console.warn(`[EmbedArtwork] Method 2: ffmpeg output too small (${outputStats.size} bytes), may be corrupted`);
            }
          } else {
            console.warn(`[EmbedArtwork] Method 2: ffmpeg output file not created`);
          }
        } catch (ffmpegError) {
          console.error(`[EmbedArtwork] Method 2 failed with error:`, ffmpegError);
        }
      }
      
      // Method 3: Try a direct buffer operation using structured image tag
      if (!success) {
        console.log(`[EmbedArtwork] ATTEMPT METHOD 3: Direct buffer method with image tag`);
        try {
          // Create tags object using the format recommended in node-id3 docs 
          console.log(`[EmbedArtwork] Creating direct tag object with imageBuffer`);
          const directTags: Tags = {
            title: trackName,
            artist: artistName,
            album: albumName,
            image: {
              mime: imageMimeType,
              type: {
                id: 3, // 3 = front cover as per ID3v2 spec
                name: "front cover"
              },
              description: albumName || "Album Cover",
              imageBuffer: imageBuffer
            }
          };
          
          // Apply tags directly to buffer
          console.log(`[EmbedArtwork] Applying tags directly to audio buffer`);
          const taggedBuffer = NodeID3.write(directTags, audioBuffer) as Buffer;
          
          if (taggedBuffer && taggedBuffer.length > audioBuffer.length * 0.9) {
            console.log(`[EmbedArtwork] Method 3: Direct buffer tagging successful, size: ${taggedBuffer.length} bytes`);
            success = true;
            processedBuffer = Buffer.from(taggedBuffer);
          } else {
            console.warn(`[EmbedArtwork] Method 3: Direct buffer tagging failed or produced suspicious result`);
            console.log(`[EmbedArtwork] ATTEMPT METHOD 4: Raw APIC frame approach`);
            
            // Final fallback - try using the raw APIC tag
            console.log(`[EmbedArtwork] Creating raw APIC tag`);
            const rawTags: Tags = {
              title: trackName,
              artist: artistName,
              album: albumName,
              APIC: {
                imageBuffer: imageBuffer,
                type: {
                  id: 3,
                  name: "front cover"
                },
                description: albumName || "Album Cover",
                mime: imageMimeType
              }
            };
            
            console.log(`[EmbedArtwork] Applying raw APIC tag to audio buffer`);
            const rawTaggedBuffer = NodeID3.write(rawTags, audioBuffer) as Buffer;
            if (rawTaggedBuffer && rawTaggedBuffer.length > audioBuffer.length * 0.9) {
              console.log(`[EmbedArtwork] Method 4: Raw APIC tagging successful, size: ${rawTaggedBuffer.length} bytes`);
              success = true;
              processedBuffer = Buffer.from(rawTaggedBuffer);
            } else {
              console.warn(`[EmbedArtwork] Method 4: Raw APIC tagging failed or produced suspicious result`);
            }
          }
        } catch (directError) {
          console.error(`[EmbedArtwork] Methods 3/4 failed with error:`, directError);
        }
      }
      
      // Return the processed audio or original if all methods failed
      console.log(`[EmbedArtwork] ✅ Returning ${success ? 'processed' : 'original'} audio, size: ${processedBuffer.length} bytes`);
      return new NextResponse(processedBuffer, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Length': processedBuffer.length.toString(),
          'Cache-Control': 'private, max-age=3600'
        }
      });
    } catch (fileError) {
      console.error(`[EmbedArtwork] File operation error:`, fileError);
      throw fileError;
    } finally {
      // Clean up temp files
      console.log(`[EmbedArtwork] Cleaning up temp files`);
      try {
        if (fs.existsSync(tempAudioFile)) {
          fs.unlinkSync(tempAudioFile);
          console.log(`[EmbedArtwork] Removed temp audio file`);
        }
        if (fs.existsSync(tempImageFile)) {
          fs.unlinkSync(tempImageFile);
          console.log(`[EmbedArtwork] Removed temp image file`);
        }
        if (fs.existsSync(outputFile)) {
          fs.unlinkSync(outputFile);
          console.log(`[EmbedArtwork] Removed temp output file`);
        }
        console.log(`[EmbedArtwork] All temp files cleaned up`);
      } catch (cleanupError) {
        console.error(`[EmbedArtwork] Error cleaning up temp files:`, cleanupError);
      }
    }
  } catch (error) {
    console.error(`[EmbedArtwork] Critical error:`, error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack
    } : String(error));
    
    return NextResponse.json({
      error: 'Failed to embed artwork',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
} 