import { NextRequest, NextResponse } from 'next/server'
import archiver from 'archiver'
import { Readable } from 'stream'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const files = formData.getAll('files')

    // Create a new archive
    const archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression
    })

    // Create a transform stream to collect the archive data
    const chunks: Uint8Array[] = []
    archive.on('data', (chunk) => chunks.push(chunk))

    // Handle archive finalization
    const archiveFinished = new Promise((resolve, reject) => {
      archive.on('end', resolve)
      archive.on('error', reject)
    })

    // Add each file to the archive
    for (const file of files) {
      if (file instanceof Blob) {
        const arrayBuffer = await file.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        const stream = Readable.from(buffer)

        archive.append(stream, { name: file.name })
      }
    }

    // Finalize the archive
    archive.finalize()

    // Wait for the archive to finish
    await archiveFinished

    // Concatenate all chunks into a single buffer
    const buffer = Buffer.concat(chunks)

    // Return the ZIP file
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="spotify-tracks.zip"'
      }
    })

  } catch (error) {
    console.error('Error creating ZIP file:', error)
    return NextResponse.json(
      { error: 'Failed to create ZIP file' },
      { status: 500 }
    )
  }
} 