"use client"

import { useDownloadStore } from "@/lib/stores/download-store"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { X, Loader2 } from "lucide-react"
import { useEffect } from "react"

export default function DownloadProgress() {
  const {
    isDownloading,
    progress,
    currentTrack,
    processedCount,
    totalTracks,
    error,
    cancelDownload
  } = useDownloadStore()

  // Log progress to console
  useEffect(() => {
    if (isDownloading && currentTrack) {
      console.log(`[Download Progress] ${processedCount}/${totalTracks} tracks processed`)
      console.log(`[Download Progress] Currently processing: ${currentTrack}`)
      console.log(`[Download Progress] Overall progress: ${progress}%`)
      console.log('----------------------------------------')
    }
  }, [isDownloading, currentTrack, processedCount, totalTracks, progress])

  if (!isDownloading) return null

  return (
    <div className="fixed bottom-4 right-4 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 border border-gray-200 dark:border-gray-700">
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div className="flex-1">
            <h3 className="font-medium text-sm">Downloading tracks...</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {currentTrack ? `Processing: ${currentTrack}` : 'Preparing download...'}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {processedCount} of {totalTracks} tracks processed
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={cancelDownload}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <Progress value={progress} className="h-1" />

        <div className="flex items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
        </div>
      </div>
    </div>
  )
}
