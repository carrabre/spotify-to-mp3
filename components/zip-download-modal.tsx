"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Download, Loader2, CheckCircle2, AlertCircle, X } from "lucide-react"
import type { Track } from "@/lib/types"

interface ZipDownloadModalProps {
  isOpen: boolean
  onClose: () => void
  tracks: Track[]
}

export default function ZipDownloadModal({ isOpen, onClose, tracks }: ZipDownloadModalProps) {
  const [isDownloading, setIsDownloading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentTrack, setCurrentTrack] = useState<string | null>(null)
  const [processedCount, setProcessedCount] = useState(0)
  const [status, setStatus] = useState<"idle" | "downloading" | "complete" | "error">("idle")
  const [error, setError] = useState<string | null>(null)
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState<string | null>(null)
  const [startTime, setStartTime] = useState<number | null>(null)

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setIsDownloading(false)
      setProgress(0)
      setCurrentTrack(null)
      setProcessedCount(0)
      setStatus("idle")
      setError(null)
      setEstimatedTimeRemaining(null)
      setStartTime(null)
    }
  }, [isOpen])

  // Filter out tracks without YouTube IDs
  const downloadableTracks = tracks.filter((track) => track.youtubeId && track.verified)

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

        <div className="mt-4 space-y-4">
          {status === "idle" && (
            <>
              <Alert>
                <AlertDescription>
                  This will download all {downloadableTracks.length} verified tracks individually. Each track will open
                  in a new tab.
                </AlertDescription>
              </Alert>

              <Button
                onClick={downloadTracksSequentially}
                disabled={isDownloading || downloadableTracks.length === 0}
                className="w-full"
              >
                <Download className="mr-2 h-4 w-4" />
                Download All Tracks
              </Button>
            </>
          )}

          {status === "downloading" && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-medium">Downloading tracks...</h3>
                  <p className="text-sm text-gray-500">
                    {processedCount} of {downloadableTracks.length} tracks processed
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={onClose} disabled={isDownloading}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <Progress value={progress} className="h-2" />

              {currentTrack && (
                <p className="text-sm text-gray-600 flex items-center">
                  <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                  Processing: {currentTrack}
                </p>
              )}

              {estimatedTimeRemaining && (
                <p className="text-xs text-gray-500">Estimated time remaining: {estimatedTimeRemaining}</p>
              )}

              <Alert>
                <AlertDescription>
                  Please allow pop-ups in your browser. Each track will open in a new tab.
                </AlertDescription>
              </Alert>
            </div>
          )}

          {status === "complete" && (
            <div className="space-y-4">
              <Alert variant="success" className="bg-green-50 text-green-800 border-green-200">
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>All download processes have been initiated!</AlertDescription>
              </Alert>

              <div className="flex justify-end">
                <Button variant="outline" onClick={onClose}>
                  Close
                </Button>
              </div>
            </div>
          )}

          {status === "error" && (
            <div className="space-y-4">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {error || "Failed to download tracks. Please try downloading them individually."}
                </AlertDescription>
              </Alert>

              <div className="flex justify-between">
                <Button variant="outline" onClick={onClose}>
                  Close
                </Button>
                <Button onClick={downloadTracksSequentially}>Try Again</Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
