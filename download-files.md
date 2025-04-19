# Core Files Related to Downloading Functionality

## API Routes

1. **app/api/mp3-transcode/route.ts**
   - Main endpoint for transcoding YouTube videos to MP3
   - Uses FFmpeg to convert audio on-the-fly
   - Forces Node.js runtime for compatibility

2. **app/api/s-ytdl-download/route.ts**
   - Alternative endpoint that uses s-ytdl library
   - Streams audio directly without transcoding
   - Used as a fallback when mp3-transcode fails

3. **app/api/ytdl-simple/route.ts**
   - Simplified endpoint for testing download functionality
   - Redirects to Y2Mate for reliable downloads

4. **app/api/direct-download/route.ts**
   - Endpoint for direct downloads using Y2Mate API
   - Provides a fallback HTML page if download fails

5. **app/api/zip-download/route.ts**
   - Endpoint for downloading multiple tracks as a ZIP file
   - Uses JSZip to create ZIP archives

## Components

1. **components/spotify-converter.tsx**
   - Main component with download logic
   - Handles track matching and download progress

2. **components/track-list.tsx**
   - Displays tracks and download buttons
   - Shows download progress and errors

3. **components/zip-download-modal.tsx**
   - Modal for downloading multiple tracks at once
   - Handles batch download process

4. **components/download-modal.tsx**
   - Modal with alternative download options
   - Used when direct download fails

5. **components/download-retry.tsx**
   - Component for retrying failed downloads
   - Provides alternative download methods

## Configuration Files

1. **vercel.json**
   - Configures memory and duration limits for download functions
   - Includes FFmpeg binary in the deployment

2. **package.json**
   - Contains dependencies like s-ytdl, ffmpeg-static, and jszip
   - Includes postinstall script to make FFmpeg executable
