"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, Download, ExternalLink } from "lucide-react"
import Link from "next/link"

interface DownloadFallbackProps {
  videoId: string
  trackName: string
  artistName: string
  onRetry: () => void
}

export default function DownloadFallback({ videoId, trackName, artistName, onRetry }: DownloadFallbackProps) {
  const [showFallback, setShowFallback] = useState(false)

  const handleFallbackDownload = () => {
    // Use a reliable YouTube to MP3 converter service
    const converterUrl = `https://www.y2mate.com/youtube-mp3/${videoId}`
    window.open(converterUrl, "_blank")
  }

  const handleDirectYouTube = () => {
    // Open directly on YouTube
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`
    window.open(youtubeUrl, "_blank")
  }

  const handleStandaloneDownload = () => {
    // Use the standalone download API
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`
    const downloadUrl = `/api/standalone-download?url=${encodeURIComponent(youtubeUrl)}`
    window.open(downloadUrl, "_blank")
  }

  return (
    <div className="mt-2">
      <Button variant="link" size="sm" className="text-gray-500 p-0" onClick={() => setShowFallback(true)}>
        Download not working? Try alternatives
      </Button>

      {showFallback && (
        <div className="space-y-2 mt-2">
          <Alert variant="warning" className="bg-amber-50 text-amber-800 border-amber-200 py-2">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>If the download failed, you can try these alternatives:</AlertDescription>
          </Alert>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={onRetry}>
              <Download className="h-4 w-4 mr-2" />
              Retry Download
            </Button>
            <Button variant="outline" size="sm" onClick={handleStandaloneDownload}>
              <Download className="h-4 w-4 mr-2" />
              Standalone Download
            </Button>
            <Button variant="outline" size="sm" onClick={handleFallbackDownload}>
              <ExternalLink className="h-4 w-4 mr-2" />
              Use Y2Mate
            </Button>
            <Button variant="outline" size="sm" onClick={handleDirectYouTube}>
              <ExternalLink className="h-4 w-4 mr-2" />
              Open on YouTube
            </Button>
          </div>

          <div className="mt-2">
            <Link href="/test-download" className="text-sm text-blue-600 hover:underline">
              Go to download test page
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
