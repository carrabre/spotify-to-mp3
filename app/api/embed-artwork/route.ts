import { NextRequest, NextResponse } from 'next/server';
import NodeID3 from 'node-id3';
import { Buffer } from 'buffer';

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
      return new NextResponse(Buffer.from(audioArrayBuffer), {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Length': audioArrayBuffer.byteLength.toString(),
          'Cache-Control': 'private, max-age=3600'
        }
      });
    }
    
    // Get the image data
    const imageArrayBuffer = await artworkResponse.arrayBuffer();
    const imageBuffer = Buffer.from(imageArrayBuffer);
    
    console.log(`[EmbedArtwork] Artwork fetched, size: ${imageBuffer.length} bytes`);
    
    // Make sure we have a valid MP3 file by checking for the MP3 header
    const audioBuffer = Buffer.from(audioArrayBuffer);
    if (!isValidMP3(audioBuffer)) {
      console.error(`[EmbedArtwork] Not a valid MP3 file`);
      return NextResponse.json({ error: 'Not a valid MP3 file' }, { status: 400 });
    }
    
    // Create tags for the MP3 file
    const tags = {
      title: trackName,
      artist: artistName,
      album: albumName,
      APIC: { // Album Picture
        mime: guessImageMimeType(imageBuffer),
        type: {
          id: 3, // Front cover
          name: 'Front Cover'
        },
        description: `Album cover for ${albumName}`,
        imageBuffer: imageBuffer
      }
    };
    
    // Write the tags to the MP3 file
    console.log(`[EmbedArtwork] Adding ID3 tags with artwork to audio file`);
    
    try {
      // Write new tags directly without trying to strip existing tags
      const taggedBuffer = NodeID3.write(tags, audioBuffer);
      
      if (!taggedBuffer) {
        throw new Error('Failed to write ID3 tags');
      }
      
      console.log(`[EmbedArtwork] Successfully embedded artwork, original size: ${audioBuffer.length}, new size: ${taggedBuffer.length}`);
      
      // Return the processed audio file
      return new NextResponse(taggedBuffer, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Length': taggedBuffer.length.toString(),
          'Cache-Control': 'private, max-age=3600'
        }
      });
    } catch (tagError) {
      console.error(`[EmbedArtwork] Error writing ID3 tags:`, tagError);
      
      // Return the original audio if tagging fails
      return new NextResponse(audioBuffer, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Length': audioBuffer.length.toString(),
          'Cache-Control': 'private, max-age=3600'
        }
      });
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