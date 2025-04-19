import { type NextRequest, NextResponse } from "next/server"
import SYTDL from "s-ytdl"
import JSZip from "jszip"

export async function POST(request: NextRequest) {
  console.log(`[s-ytdl-zip] Starting ZIP download request`)

  try {
    const data = await request.json()
    const { tracks } = data

    console.log(`[s-ytdl-zip] Received request with ${tracks?.length || 0} tracks`)

    if (!tracks || !Array.isArray(tracks) || tracks.length === 0) {
      console.error(`[s-ytdl-zip] Error: No tracks provided in request`)
      return NextResponse.json({ error: "No tracks provided" }, { status: 400 })
    }

    console.log(`[s-ytdl-zip] Starting ZIP download for ${tracks.length} tracks using s-ytdl`)

    // Create a new ZIP file
    const zip = new JSZip()
    console.log(`[s-ytdl-zip] Created new JSZip instance`)

    // Track successful downloads
    let successCount = 0
    let failCount = 0
    const errors: any[] = []

    // Process each track sequentially to avoid memory issues
    console.log(`[s-ytdl-zip] Processing tracks sequentially`)
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i]
      console.log(`[s-ytdl-zip] Processing track ${i + 1}/${tracks.length}: "${track.name}"`)

      if (!track.youtubeId) {
        console.log(`[s-ytdl-zip] Skipping track "${track.name}" - no YouTube ID`)
        continue
      }

      try {
        // Create a sanitized filename
        const sanitizedFilename = `${track.name.replace(/[^a-z0-9]/gi, "_")}_${track.artists.join("_").replace(/[^a-z0-9]/gi, "_")}.mp3`
        console.log(`[s-ytdl-zip] Sanitized filename: ${sanitizedFilename}`)

        // YouTube URL
        const youtubeUrl = `https://www.youtube.com/watch?v=${track.youtubeId}`
        console.log(`[s-ytdl-zip] YouTube URL: ${youtubeUrl}`)

        // Download using s-ytdl (192kbps quality)
        console.log(`[s-ytdl-zip] Calling s-ytdl.dl for track "${track.name}"`)
        console.time(`[s-ytdl-zip] s-ytdl.dl execution time for track ${i + 1}`)

        const downloadResult = await SYTDL.dl(youtubeUrl, "4", "audio").catch((error) => {
          console.error(`[s-ytdl-zip] s-ytdl.dl error for track "${track.name}":`, error)
          throw error
        })

        console.timeEnd(`[s-ytdl-zip] s-ytdl.dl execution time for track ${i + 1}`)

        if (!downloadResult || !downloadResult.url) {
          console.error(`[s-ytdl-zip] Error: No download URL returned from s-ytdl for track "${track.name}"`)
          throw new Error("Failed to get download URL from s-ytdl")
        }

        console.log(
          `[s-ytdl-zip] Got download URL for track "${track.name}": ${downloadResult.url.substring(0, 50)}...`,
        )

        // Fetch the audio file
        console.log(`[s-ytdl-zip] Fetching audio file for track "${track.name}"`)
        console.time(`[s-ytdl-zip] Audio fetch time for track ${i + 1}`)

        const response = await fetch(downloadResult.url).catch((error) => {
          console.error(`[s-ytdl-zip] Fetch error for track "${track.name}":`, error)
          throw error
        })

        console.timeEnd(`[s-ytdl-zip] Audio fetch time for track ${i + 1}`)

        if (!response.ok) {
          console.error(
            `[s-ytdl-zip] Fetch response not OK for track "${track.name}": ${response.status} ${response.statusText}`,
          )
          throw new Error(`Failed to download audio: ${response.statusText}`)
        }

        // Get the audio data
        console.log(`[s-ytdl-zip] Converting response to arrayBuffer for track "${track.name}"`)
        console.time(`[s-ytdl-zip] ArrayBuffer conversion time for track ${i + 1}`)

        const audioBuffer = await response.arrayBuffer().catch((error) => {
          console.error(`[s-ytdl-zip] ArrayBuffer conversion error for track "${track.name}":`, error)
          throw error
        })

        console.timeEnd(`[s-ytdl-zip] ArrayBuffer conversion time for track ${i + 1}`)
        console.log(`[s-ytdl-zip] Audio buffer size for track "${track.name}": ${audioBuffer.byteLength} bytes`)

        // Add to ZIP
        console.log(`[s-ytdl-zip] Adding track "${track.name}" to ZIP file`)
        zip.file(sanitizedFilename, Buffer.from(audioBuffer))
        successCount++

        console.log(`[s-ytdl-zip] Added "${sanitizedFilename}" to ZIP (${successCount}/${tracks.length})`)
      } catch (error) {
        console.error(`[s-ytdl-zip] Error processing track "${track.name}":`, error)
        failCount++
        errors.push({
          track: track.name,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    // If all downloads failed, return an error
    if (successCount === 0 && failCount > 0) {
      console.error(`[s-ytdl-zip] All downloads failed (${failCount} failures)`)
      return NextResponse.json({
        error: "Failed to download any tracks",
        details: errors,
      })
    }

    // Generate the ZIP file
    console.log(`[s-ytdl-zip] Generating ZIP file with ${successCount} tracks`)
    console.time(`[s-ytdl-zip] ZIP generation time`)

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" }).catch((error) => {
      console.error(`[s-ytdl-zip] ZIP generation error:`, error)
      throw error
    })

    console.timeEnd(`[s-ytdl-zip] ZIP generation time`)
    console.log(`[s-ytdl-zip] ZIP file size: ${zipBuffer.length} bytes`)

    // Set headers for file download
    const headers = new Headers()
    headers.set("Content-Disposition", `attachment; filename="spotify-tracks.zip"`)
    headers.set("Content-Type", "application/zip")
    headers.set("Content-Length", zipBuffer.length.toString())

    // Return the ZIP file
    console.log(`[s-ytdl-zip] Sending ZIP response with ${zipBuffer.length} bytes`)
    return new NextResponse(zipBuffer, {
      status: 200,
      headers,
    })
  } catch (error) {
    console.error("[s-ytdl-zip] Error creating ZIP file:", error)
    return NextResponse.json(
      {
        error: "Failed to create ZIP file",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
