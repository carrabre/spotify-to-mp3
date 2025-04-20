import { NextResponse } from 'next/server'
import { Track } from '@/lib/types'
import { getYoutubeAudioStream } from '@/lib/youtube'
import archiver from 'archiver'
import { Readable } from 'stream'

export async function POST(request: Request) {
  try {
    const { tracks } = await request.json() as { tracks: Track[] }

    if (!tracks || !Array.isArray(tracks) || tracks.length === 0) {
      return NextResponse.json(
        { error: 'No tracks provided' },
        { status: 400 }
      )
    }

    // Create a new archive
    const archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression
    })

    // Set the response headers
    const headers = new Headers()
    headers.set('Content-Type', 'application/zip')
    headers.set('Content-Disposition', 'attachment; filename="spotify-tracks.zip"')

    // Create a TransformStream to handle the archive
    const { readable, writable } = new TransformStream()
    archive.pipe(writable)

    // Process each track
    for (const track of tracks) {
      if (!track.youtubeId) continue

      try {
        const audioStream = await getYoutubeAudioStream(track.youtubeId)
        const fileName = `${track.name} - ${track.artist}.mp3`
        archive.append(audioStream, { name: fileName })
      } catch (error) {
        console.error(`Error processing track ${track.name}:`, error)
        // Continue with other tracks even if one fails
      }
    }

    // Finalize the archive
    archive.finalize()

    return new NextResponse(readable, { headers })
  } catch (error) {
    console.error('Error creating zip file:', error)
    return NextResponse.json(
      { error: 'Failed to create zip file' },
      { status: 500 }
    )
  }
}
