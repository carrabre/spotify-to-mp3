import { NextRequest, NextResponse } from 'next/server';
import NodeID3 from 'node-id3';
import { Buffer } from 'buffer';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { promisify } from 'util';
import { execFile } from 'child_process';

const execFileAsync = promisify(execFile);

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

interface Tags {
  title?: string;
  artist?: string;
  album?: string;
  image?: ImageTag;
  // Add other potential tag fields as needed
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60 seconds for processing

// Handle the multipart form data from the client and embed album artwork
export async function POST(request: NextRequest) {
  console.log(`[EmbedArtwork] Processing request`);
  
  try {
    // Parse the multipart form data
    const formData = await request.formData();
    
    // Get file and metadata
    const audioFile = formData.get('audio') as File;
    const trackName = formData.get('trackName') as string;
    const artistName = formData.get('artistName') as string;
    const albumName = formData.get('albumName') as string;
    const albumImageUrl = formData.get('albumImageUrl') as string;
    
    if (!audioFile || !(audioFile instanceof File)) {
      console.error(`[EmbedArtwork] Missing audio file in request`);
      return NextResponse.json({ error: 'Missing audio file' }, { status: 400 });
    }
    
    if (!albumImageUrl) {
      console.error(`[EmbedArtwork] Missing album image URL`);
      return NextResponse.json({ error: 'Missing album image URL' }, { status: 400 });
    }
    
    console.log(`[EmbedArtwork] Processing "${trackName}" by ${artistName}, album: ${albumName}`);
    console.log(`[EmbedArtwork] Audio file size: ${audioFile.size} bytes`);
    
    // Get the audio as array buffer
    const audioArrayBuffer = await audioFile.arrayBuffer();
    const audioBuffer = Buffer.from(audioArrayBuffer);
    
    // Fetch the album artwork
    console.log(`[EmbedArtwork] Fetching album artwork from: ${albumImageUrl}`);
    const artworkResponse = await fetch(albumImageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    if (!artworkResponse.ok) {
      console.error(`[EmbedArtwork] Failed to fetch album artwork: ${artworkResponse.status}`);
      // Return the original audio if we can't get the artwork
      return new NextResponse(audioBuffer, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Length': audioBuffer.length.toString(),
          'Cache-Control': 'private, max-age=3600'
        }
      });
    }
    
    // Get the image data
    const imageArrayBuffer = await artworkResponse.arrayBuffer();
    const imageBuffer = Buffer.from(imageArrayBuffer);
    
    console.log(`[EmbedArtwork] Artwork fetched, size: ${imageBuffer.length} bytes`);
    
    // Create temp filenames
    const tempDir = os.tmpdir();
    const timestamp = new Date().getTime();
    const tempAudioFile = path.join(tempDir, `audio-${timestamp}.mp3`);
    const tempImageFile = path.join(tempDir, `cover-${timestamp}.jpg`);
    const outputFile = path.join(tempDir, `output-${timestamp}.mp3`);
    
    try {
      // Save the files
      console.log(`[EmbedArtwork] Saving temp files to ${tempDir}`);
      fs.writeFileSync(tempAudioFile, audioBuffer);
      fs.writeFileSync(tempImageFile, imageBuffer);
      
      // Try method 1: Using NodeID3 directly - the standard way
      try {
        console.log(`[EmbedArtwork] Trying direct NodeID3 method`);
        
        const tags = {
          title: trackName,
          artist: artistName,
          album: albumName,
          image: {
            mime: 'image/jpeg',
            type: {
              id: 3,
              name: 'front cover'
            },
            description: albumName,
            imageBuffer: imageBuffer
          }
        };
        
        // Use the file-based API for better compatibility
        const success = NodeID3.write(tags, tempAudioFile);
        
        if (success) {
          console.log(`[EmbedArtwork] NodeID3 direct write successful`);
          const taggedBuffer = fs.readFileSync(tempAudioFile);
          
          // Return the processed file
          return new NextResponse(taggedBuffer, {
            headers: {
              'Content-Type': 'audio/mpeg',
              'Content-Length': taggedBuffer.length.toString(),
              'Cache-Control': 'private, max-age=3600'
            }
          });
        } else {
          console.log(`[EmbedArtwork] NodeID3 direct write failed, trying alternative method`);
        }
      } catch (nodeID3Error) {
        console.error(`[EmbedArtwork] NodeID3 error:`, nodeID3Error);
        // Continue to next method
      }
      
      // Try method 2: Using ffmpeg if available
      try {
        console.log(`[EmbedArtwork] Trying ffmpeg method`);
        
        // Check if ffmpeg is installed
        await execFileAsync('ffmpeg', ['-version']).catch(() => {
          throw new Error('ffmpeg not available');
        });
        
        // Use ffmpeg to embed cover art
        await execFileAsync('ffmpeg', [
          '-i', tempAudioFile,
          '-i', tempImageFile,
          '-map', '0:0',
          '-map', '1:0',
          '-c', 'copy',
          '-metadata', `title=${trackName}`,
          '-metadata', `artist=${artistName}`,
          '-metadata', `album=${albumName}`,
          '-id3v2_version', '3',
          outputFile
        ]);
        
        if (fs.existsSync(outputFile)) {
          console.log(`[EmbedArtwork] ffmpeg processing successful`);
          const taggedBuffer = fs.readFileSync(outputFile);
          
          // Return the processed file
          return new NextResponse(taggedBuffer, {
            headers: {
              'Content-Type': 'audio/mpeg',
              'Content-Length': taggedBuffer.length.toString(),
              'Cache-Control': 'private, max-age=3600'
            }
          });
        }
      } catch (ffmpegError) {
        console.error(`[EmbedArtwork] ffmpeg error:`, ffmpegError);
        // Continue to next method
      }
      
      // Try method 3: Use NodeID3 again but with a different approach
      try {
        console.log(`[EmbedArtwork] Trying alternative NodeID3 approach`);
        
        // Remove existing tags to avoid conflicts
        NodeID3.removeTags(tempAudioFile);
        
        // Create tags
        const tags = {
          title: trackName,
          artist: artistName,
          album: albumName,
          APIC: { // This is the raw frame ID
            imageBuffer: imageBuffer,
            type: 3, // Front cover
            description: albumName,
            mime: 'image/jpeg'
          }
        };
        
        // Update tags - this method might have better compatibility
        const updateSuccess = NodeID3.update(tags, tempAudioFile);
        
        if (updateSuccess) {
          console.log(`[EmbedArtwork] NodeID3 update successful`);
          const taggedBuffer = fs.readFileSync(tempAudioFile);
          
          // Return the processed file
          return new NextResponse(taggedBuffer, {
            headers: {
              'Content-Type': 'audio/mpeg',
              'Content-Length': taggedBuffer.length.toString(),
              'Cache-Control': 'private, max-age=3600'
            }
          });
        }
      } catch (updateError) {
        console.error(`[EmbedArtwork] NodeID3 update error:`, updateError);
      }
      
      // If all methods failed, return the original audio
      console.warn(`[EmbedArtwork] All methods failed, returning original audio`);
      return new NextResponse(audioBuffer, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Length': audioBuffer.length.toString(),
          'Cache-Control': 'private, max-age=3600'
        }
      });
    } catch (fileError) {
      console.error(`[EmbedArtwork] File operation error:`, fileError);
      throw fileError;
    } finally {
      // Clean up temp files
      try {
        if (fs.existsSync(tempAudioFile)) fs.unlinkSync(tempAudioFile);
        if (fs.existsSync(tempImageFile)) fs.unlinkSync(tempImageFile);
        if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
        console.log(`[EmbedArtwork] Temp files cleaned up`);
      } catch (cleanupError) {
        console.error(`[EmbedArtwork] Error cleaning up temp files:`, cleanupError);
      }
    }
  } catch (error) {
    console.error(`[EmbedArtwork] Error:`, error instanceof Error ? {
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