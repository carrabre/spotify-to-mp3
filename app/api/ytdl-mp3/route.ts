export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { Downloader } from 'ytdl-mp3';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { Readable } from 'stream';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const url = searchParams.get('url');
  if (!url) {
    return NextResponse.json({ error: 'Missing `url` query parameter' }, { status: 400 });
  }

  // Prepare temporary output directory
  const tempDir = path.join(os.tmpdir(), 'ytdl-mp3-downloads');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Initialize the downloader with tags and output directory
  const downloader = new Downloader({
    getTags: true,
    outputDir: tempDir,
    silentMode: true
  });

  let info;
  try {
    info = await downloader.downloadSong(url);
  } catch (error: any) {
    console.error('ytdl-mp3 download error:', error);
    return NextResponse.json(
      { error: 'Failed to download song', details: error.message || String(error) },
      { status: 500 }
    );
  }

  const filePath = info.outputFile;
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'Downloaded file not found' }, { status: 500 });
  }

  const fileName = path.basename(filePath);
  const fileStream = fs.createReadStream(filePath);
  const webStream = Readable.toWeb(fileStream) as unknown as ReadableStream<Uint8Array>;

  // Set headers for streaming download
  const headers = new Headers({
    'Content-Type': 'audio/mpeg',
    'Content-Disposition': `attachment; filename="${fileName}"`
  });

  const response = new NextResponse(webStream, { headers });

  // Clean up temporary file after the response body is consumed
  response.clone().blob().then(() => {
    try {
      fs.unlinkSync(filePath);
      console.log('Deleted temporary file:', filePath);
    } catch (cleanupError) {
      console.error('Error deleting temporary file:', cleanupError);
    }
  });

  return response;
} 