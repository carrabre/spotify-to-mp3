"use client"

import { useState, useEffect } from "react"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react"

interface DownloadProgressProps {
  isDownloading: boolean
  fileName: string
  onComplete?: () => void
}

export default function DownloadProgress({ isDownloading, fileName, onComplete }: DownloadProgressProps) {
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState<"downloading" | "complete" | "error">("downloading")
  const [message, setMessage] = useState<string>("")

  useEffect(() => {
    if (!isDownloading) {
      return
    }

    // Simulate download progress
    let interval: NodeJS.Timeout

    // Reset state when download starts
    setProgress(0)
    setStatus("downloading")
    setMessage(`Preparing to download ${fileName}...`)

    // Simulate progress updates
    interval = setInterval(() => {
      setProgress((prev) => {
        // Slow down progress as it gets higher to simulate real download
        const increment = prev < 30 ? 5 : prev < 60 ? 3 : prev < 90 ? 1 : 0.5
        const newProgress = Math.min(prev + increment, 99)

        // Update message based on progress
        if (prev < 10 && newProgress >= 10) {
          setMessage(`Downloading ${fileName}...`)
        } else if (prev < 50 && newProgress >= 50) {
          setMessage(`Converting to MP3...`)
        } else if (prev < 80 && newProgress >= 80) {
          setMessage(`Finalizing download...`)
        }

        return newProgress
      })
    }, 300)

    // Cleanup interval
    return () => {
      clearInterval(interval)

      // If we're unmounting and progress was started but not completed,
      // assume download completed successfully
      if (progress > 0 && progress < 100 && status === "downloading") {
        setProgress(100)
        setStatus("complete")
        setMessage(`Download complete!`)
        if (onComplete) onComplete()
      }
    }
  }, [isDownloading, fileName, onComplete])

  if (!isDownloading && status === "downloading") {
    return null
  }

  return (
    <div className="mt-2 space-y-2">
      {status === "downloading" && (
        <>
          <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-1">
            <span className="flex items-center">
              <Loader2 className="h-3 w-3 mr-2 animate-spin" />
              {message}
            </span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </>
      )}

      {status === "complete" && (
        <Alert variant="success" className="bg-green-50 text-green-800 border-green-200 py-2">
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>Download complete! Check your downloads folder.</AlertDescription>
        </Alert>
      )}

      {status === "error" && (
        <Alert variant="destructive" className="py-2">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Download failed. Please try again.</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
