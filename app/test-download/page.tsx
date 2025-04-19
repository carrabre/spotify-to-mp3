"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Info, Download, ExternalLink, AlertTriangle } from "lucide-react"
import Image from "next/image"
import Link from "next/link"

export default function TestDownload() {
  const [videoUrl, setVideoUrl] = useState("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
  const [videoId, setVideoId] = useState("dQw4w9WgXcQ")
  const [isDownloading, setIsDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showFallback, setShowFallback] = useState(false)

  // Extract video ID from URL
  const handleUrlChange = (url: string) => {
    setVideoUrl(url)
    setError(null)

    try {
      // Try to extract video ID
      let extractedId = ""

      if (url.includes("youtube.com/watch?v=")) {
        const urlObj = new URL(url)
        extractedId = urlObj.searchParams.get("v") || ""
      } else if (url.includes("youtu.be/")) {
        extractedId = url.split("youtu.be/")[1]?.split("?")[0] || ""
      }

      if (extractedId) {
        setVideoId(extractedId)
      }
    } catch (err) {
      console.error("Error parsing URL:", err)
    }
  }

  const handleDownload = () => {
    if (!videoUrl) {
      setError("Please enter a YouTube URL")
      return
    }

    setIsDownloading(true)
    setError(null)

    try {
      // Create the download URL using the standalone API
      const downloadUrl = `/api/standalone-download?url=${encodeURIComponent(videoUrl)}`

      // Open in a new tab to avoid navigation issues
      window.open(downloadUrl, "_blank")

      // Reset downloading state after a delay
      setTimeout(() => {
        setIsDownloading(false)
      }, 2000)
    } catch (err) {
      console.error("Download error:", err)
      setError("Failed to start download. Please try again.")
      setIsDownloading(false)
    }
  }

  const handleFallbackDownload = () => {
    // Use a reliable YouTube to MP3 converter service
    const converterUrl = `https://www.y2mate.com/youtube-mp3/${videoId}`
    window.open(converterUrl, "_blank")
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-6 text-center">YouTube to MP3 Download Test</h1>

      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Download MP3 from YouTube</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              This page tests the direct download functionality using a standalone implementation.
            </AlertDescription>
          </Alert>

          {videoId && (
            <div className="flex items-center gap-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-md">
              <Image
                src={`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`}
                alt="Video thumbnail"
                width={120}
                height={90}
                className="rounded-md"
              />
              <div>
                <h3 className="font-medium">Video Preview</h3>
                <a
                  href={`https://www.youtube.com/watch?v=${videoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center mt-1"
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Open on YouTube
                </a>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-sm font-medium">YouTube URL</label>
            <Input
              value={videoUrl}
              onChange={(e) => handleUrlChange(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
            />
            <p className="text-xs text-gray-500">Enter a YouTube video URL to download as MP3</p>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button onClick={handleDownload} disabled={isDownloading || !videoUrl} className="w-full">
            <Download className="mr-2 h-4 w-4" />
            {isDownloading ? "Starting Download..." : "Download MP3"}
          </Button>

          {showFallback ? (
            <div className="space-y-2 mt-4">
              <Alert variant="warning" className="bg-amber-50 text-amber-800 border-amber-200">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>If the direct download doesn't work, try these alternatives:</AlertDescription>
              </Alert>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={handleFallbackDownload}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Use Y2Mate
                </Button>
                <Button
                  variant="outline"
                  onClick={() => window.open(`https://www.youtube.com/watch?v=${videoId}`, "_blank")}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open on YouTube
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="link" size="sm" className="text-gray-500 p-0" onClick={() => setShowFallback(true)}>
              Download not working? Try alternatives
            </Button>
          )}

          <div className="text-sm text-gray-500 mt-4">
            <p className="font-medium">Troubleshooting:</p>
            <ul className="list-disc pl-5 space-y-1 mt-1">
              <li>If the download doesn't start, check if pop-ups are blocked</li>
              <li>For long videos, the download may take some time to start</li>
              <li>If you encounter errors, try a different video</li>
            </ul>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end">
          <Link href="/" className="text-sm text-blue-600 hover:underline">
            Back to Home
          </Link>
        </CardFooter>
      </Card>
    </div>
  )
}
