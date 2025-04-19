import { type NextRequest, NextResponse } from "next/server"
import fetch from "node-fetch"

// List of working YouTube to MP3 API services
const MP3_SERVICES = [
  {
    name: "yt-download.org API",
    getUrl: (videoId: string) => `https://yt-download.org/api/button/mp3/${videoId}`,
    test: async (url: string) => {
      const response = await fetch(url, { method: "HEAD" })
      return response.status === 200
    },
  },
  {
    name: "y2mate API",
    getUrl: (videoId: string) => `https://www.y2mate.com/mates/convert/${videoId}`,
    test: async (url: string) => {
      const response = await fetch(url, { method: "HEAD" })
      return response.status === 200
    },
  },
  {
    name: "ytmp3.cc API",
    getUrl: (videoId: string) => `https://ytmp3.cc/download/${videoId}`,
    test: async (url: string) => {
      const response = await fetch(url, { method: "HEAD" })
      return response.status === 200
    },
  },
]

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const videoId = searchParams.get("videoId")
  const title = searchParams.get("title") || "track"
  const artist = searchParams.get("artist") || ""
  const requestId = Date.now().toString()

  console.log(`[direct-youtube][${requestId}] Starting direct download for videoId: ${videoId}`)

  if (!videoId) {
    console.error(`[direct-youtube][${requestId}] Error: No videoId provided`)
    return NextResponse.json({ error: "Video ID is required" }, { status: 400 })
  }

  try {
    // Create a sanitized filename
    const sanitizedFilename = `${title.replace(/[^a-z0-9]/gi, "_")}${
      artist ? "_" + artist.replace(/[^a-z0-9]/gi, "_") : ""
    }.mp3`
    console.log(`[direct-youtube][${requestId}] Sanitized filename: ${sanitizedFilename}`)

    // Try to find a working service
    console.log(`[direct-youtube][${requestId}] Testing available MP3 services...`)

    for (const service of MP3_SERVICES) {
      try {
        const serviceUrl = service.getUrl(videoId)
        console.log(`[direct-youtube][${requestId}] Testing service: ${service.name} with URL: ${serviceUrl}`)

        const isWorking = await service.test(serviceUrl)

        if (isWorking) {
          console.log(`[direct-youtube][${requestId}] Found working service: ${service.name}`)

          // Redirect to the working service
          console.log(`[direct-youtube][${requestId}] Redirecting to: ${serviceUrl}`)
          return NextResponse.redirect(serviceUrl)
        } else {
          console.log(`[direct-youtube][${requestId}] Service ${service.name} is not available`)
        }
      } catch (serviceError) {
        console.error(`[direct-youtube][${requestId}] Error testing service ${service.name}:`, serviceError)
      }
    }

    // If no service is working, fall back to a reliable YouTube URL
    console.log(`[direct-youtube][${requestId}] No working service found, falling back to YouTube URL`)
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`

    // Create a simple HTML page with download instructions
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Download ${title}</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px; }
            h1 { color: #333; }
            .container { border: 1px solid #ddd; border-radius: 8px; padding: 20px; margin-top: 20px; }
            .button { display: inline-block; background: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; margin-top: 10px; }
            .youtube { background: #FF0000; }
            .steps { margin-top: 20px; }
            .steps li { margin-bottom: 10px; }
          </style>
        </head>
        <body>
          <h1>Download "${title}"</h1>
          <div class="container">
            <p>We couldn't automatically download this track. Please try one of these options:</p>
            
            <a href="https://www.y2mate.com/youtube-mp3/${videoId}" class="button" target="_blank">Download with Y2Mate</a>
            <a href="https://ytmp3.cc/en/youtube-mp3/${videoId}" class="button" target="_blank">Download with YTMP3.cc</a>
            <a href="${youtubeUrl}" class="button youtube" target="_blank">Open on YouTube</a>
            
            <div class="steps">
              <h3>Manual download steps:</h3>
              <ol>
                <li>Click one of the buttons above to open a download service</li>
                <li>Follow the instructions on the service's website</li>
                <li>Download the MP3 file</li>
                <li>If one service doesn't work, try another</li>
              </ol>
            </div>
          </div>
        </body>
      </html>
    `

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html",
      },
    })
  } catch (error) {
    console.error(`[direct-youtube][${requestId}] Error in direct download:`, error)
    return NextResponse.json(
      {
        error: "Failed to process download",
        details: error instanceof Error ? error.message : String(error),
        requestId: requestId,
      },
      { status: 500 },
    )
  }
}
