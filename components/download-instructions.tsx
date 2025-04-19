"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, ExternalLink, Download, Youtube } from "lucide-react"

interface DownloadInstructionsProps {
  videoId: string
  trackName: string
  artistName: string
}

export default function DownloadInstructions({ videoId, trackName, artistName }: DownloadInstructionsProps) {
  const [showInstructions, setShowInstructions] = useState(false)

  const handleY2Mate = () => {
    window.open(`https://www.y2mate.com/youtube-mp3/${videoId}`, "_blank")
  }

  const handleYTMP3 = () => {
    window.open(`https://ytmp3.cc/en/youtube-mp3/${videoId}`, "_blank")
  }

  const handleYouTube = () => {
    window.open(`https://www.youtube.com/watch?v=${videoId}`, "_blank")
  }

  const handleDirectDownload = () => {
    window.open(
      `/api/direct-youtube?videoId=${videoId}&title=${encodeURIComponent(trackName)}&artist=${encodeURIComponent(artistName)}`,
      "_blank",
    )
  }

  return (
    <div className="mt-2">
      <Button
        variant="link"
        size="sm"
        className="text-gray-500 p-0"
        onClick={() => setShowInstructions(!showInstructions)}
      >
        {showInstructions ? "Hide download options" : "Show download options"}
      </Button>

      {showInstructions && (
        <div className="mt-2 space-y-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-md">
          <Alert variant="warning" className="bg-amber-50 text-amber-800 border-amber-200 py-2">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Automatic download may not work for all tracks. Try these alternatives:</AlertDescription>
          </Alert>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" onClick={handleDirectDownload}>
              <Download className="h-4 w-4 mr-2" />
              Direct Download
            </Button>

            <Button variant="outline" size="sm" onClick={handleY2Mate}>
              <ExternalLink className="h-4 w-4 mr-2" />
              Y2Mate
            </Button>

            <Button variant="outline" size="sm" onClick={handleYTMP3}>
              <ExternalLink className="h-4 w-4 mr-2" />
              YTMP3.cc
            </Button>

            <Button variant="outline" size="sm" onClick={handleYouTube}>
              <Youtube className="h-4 w-4 mr-2" />
              YouTube
            </Button>
          </div>

          <div className="text-xs text-gray-500 mt-2">
            <p>
              <strong>Tip:</strong> If one service doesn't work, try another. Some services may have limitations or may
              be temporarily unavailable.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
