"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Download, Loader2, CheckCircle2, AlertCircle, X, AlertTriangle, CheckCircle, Clock, ExternalLink } from "lucide-react"
import type { Track } from "@/lib/types"

interface ZipDownloadModalProps {
  isOpen: boolean
  onClose: () => void
  tracks: Track[]
  sourceName?: string
}

export default function ZipDownloadModal({ isOpen, onClose, tracks, sourceName = "" }: ZipDownloadModalProps) {
  const [status, setStatus] = useState<"initial" | "downloading" | "complete" | "error">("initial")
  const [progress, setProgress] = useState(0)
  const [processedCount, setProcessedCount] = useState(0)
  const [currentTrack, setCurrentTrack] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)
  const [startTime, setStartTime] = useState<number | null>(null)
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState<string | null>(null)

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStatus("initial")
      setProgress(0)
      setProcessedCount(0)
      setCurrentTrack(null)
      setError(null)
      setIsDownloading(false)
      setStartTime(null)
      setEstimatedTimeRemaining(null)
    }
  }, [isOpen])

  // Filter out tracks that don't have YouTube IDs
  const downloadableTracks = tracks.filter((track) => track.youtubeId && track.verified)

  // Create a safe filename based on source name
  const safeSourceName = sourceName 
    ? sourceName.replace(/[/\\:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim() 
    : "spotify_tracks";

  // Download tracks individually in sequence
  const downloadTracksSequentially = async () => {
    if (downloadableTracks.length === 0) return

    console.log(`[ZipModal] Starting sequential download for ${downloadableTracks.length} tracks`)
    setIsDownloading(true)
    setStatus("downloading")
    setStartTime(Date.now())
    setProgress(0)
    setProcessedCount(0)
    setError(null)

    // Process each track
    for (let i = 0; i < downloadableTracks.length; i++) {
      const track = downloadableTracks[i]
      setCurrentTrack(track.name)

      try {
        // Update progress
        const newProgress = Math.floor(((i + 0.5) / downloadableTracks.length) * 100)
        setProgress(newProgress)
        setProcessedCount(i)

        // Calculate estimated time remaining
        if (startTime) {
          const elapsedMs = Date.now() - startTime
          const msPerTrack = elapsedMs / (i + 1)
          const tracksRemaining = downloadableTracks.length - (i + 1)
          const msRemaining = msPerTrack * tracksRemaining

          // Format time remaining
          let timeString = "Less than a minute"
          if (msRemaining > 60000) {
            const minutes = Math.ceil(msRemaining / 60000)
            timeString = `About ${minutes} minute${minutes > 1 ? "s" : ""}`
          }

          setEstimatedTimeRemaining(timeString)
        }

        // Create the download URL using our direct download endpoint
        const downloadUrl = `/api/direct-download?videoId=${track.youtubeId}&title=${encodeURIComponent(track.name)}&artist=${encodeURIComponent(track.artists.join(", "))}&direct=true`

        // Create a hidden anchor element to trigger the download
        const downloadLink = document.createElement("a")
        downloadLink.href = downloadUrl
        downloadLink.download = `${track.name.replace(/[^a-z0-9]/gi, "_")}_${track.artists.join("_").replace(/[^a-z0-9]/gi, "_")}.mp3`
        document.body.appendChild(downloadLink)

        // Trigger the download
        console.log(`[ZipModal] Initiating download for track "${track.name}"`)
        downloadLink.click()

        // Clean up
        document.body.removeChild(downloadLink)

        // Wait a bit before proceeding to the next track
        await new Promise((resolve) => setTimeout(resolve, 2000))
      } catch (error) {
        console.error(`[ZipModal] Error downloading track "${track.name}":`, error)
        // Continue with next track even if one fails
      }
    }

    // Complete the process
    setProgress(100)
    setProcessedCount(downloadableTracks.length)
    setCurrentTrack(null)
    setStatus("complete")
    setIsDownloading(false)
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-lg">Download All Tracks ({downloadableTracks.length})</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {status === "initial" && (
            <div className="space-y-4">
              <p>You have {downloadableTracks.length} tracks available for download.</p>

              {downloadableTracks.length > 5 && (
                <div className="flex items-start gap-2 text-amber-600 bg-amber-50 p-3 rounded-md">
                  <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">Download may take some time</p>
                    <p className="text-sm">
                      You're downloading {downloadableTracks.length} tracks. This might take a while and could trigger browser security warnings.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <Button
                  onClick={downloadTracksSequentially}
                  disabled={downloadableTracks.length === 0}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download {downloadableTracks.length} Tracks Sequentially
                </Button>

                <Button
                  variant="outline"
                  asChild
                >
                  <a
                    href={`/api/zip-download?tracks=${encodeURIComponent(JSON.stringify(downloadableTracks))}&name=${encodeURIComponent(safeSourceName)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Download as ZIP (Server-Side)
                  </a>
                </Button>
              </div>
            </div>
          )}

          {status === "downloading" && (
            <div className="space-y-4">
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>
                  {processedCount} of {downloadableTracks.length} tracks processed
                </span>
                <span>{progress}%</span>
              </div>

              <Progress value={progress} className="h-2" />

              {currentTrack && (
                <div className="text-sm text-gray-600">
                  Currently downloading: {currentTrack}
                </div>
              )}

              {estimatedTimeRemaining && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Clock className="h-4 w-4" />
                  Estimated time remaining: {estimatedTimeRemaining}
                </div>
              )}

              <Button variant="outline" onClick={() => setIsDownloading(false)} disabled={!isDownloading}>
                Cancel
              </Button>
            </div>
          )}

          {status === "complete" && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 text-green-600 bg-green-50 p-3 rounded-md">
                <CheckCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">Download Complete</p>
                  <p className="text-sm">All tracks have been processed. Check your downloads folder.</p>
                </div>
              </div>

              <Button onClick={onClose}>Close</Button>
            </div>
          )}

          {status === "error" && error && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 text-red-600 bg-red-50 p-3 rounded-md">
                <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">Error</p>
                  <p className="text-sm">{error}</p>
                </div>
              </div>

              <Button onClick={onClose}>Close</Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
