"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, RefreshCw, ExternalLink } from "lucide-react"
import { Progress } from "@/components/ui/progress"

interface DownloadRetryProps {
  videoId: string
  trackName: string
  artistName: string
  onRetry: () => void
}

export default function DownloadRetry({ videoId, trackName, artistName, onRetry }: DownloadRetryProps) {
  const [isRetrying, setIsRetrying] = useState(false)
  const [retryProgress, setRetryProgress] = useState(0)
  const [retryAttempt, setRetryAttempt] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const handleRetry = async () => {
    setIsRetrying(true)
    setRetryProgress(0)
    setError(null)
    setRetryAttempt((prev) => prev + 1)

    const requestId = Date.now().toString()
    console.log(`[DownloadRetry][${requestId}] Starting retry attempt ${retryAttempt + 1} for "${trackName}"`)

    try {
      // Simulate progress
      const progressInterval = setInterval(() => {
        setRetryProgress((prev) => {
          const newProgress = Math.min(prev + 5, 95)
          return newProgress
        })
      }, 200)

      // Create the download URL with retry attempt in query params - use mp3-transcode endpoint
      const downloadUrl = `/api/mp3-transcode?videoId=${videoId}&title=${encodeURIComponent(trackName)}&artist=${encodeURIComponent(artistName)}&retry=${retryAttempt + 1}`
      console.log(`[DownloadRetry][${requestId}] Retry download URL: ${downloadUrl}`)

      // Wait a moment to show progress
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // Fetch the file
      console.log(`[DownloadRetry][${requestId}] Fetching file for retry`)
      const response = await fetch(downloadUrl)
      
      // Log response details
      const contentType = response.headers.get('content-type') || 'unknown'
      const contentLength = response.headers.get('content-length') || 'unknown'
      const contentDisposition = response.headers.get('content-disposition') || 'unknown'
      
      console.log(`[DownloadRetry][${requestId}] Response received:`, {
        status: response.status,
        statusText: response.statusText,
        contentType,
        contentLength,
        contentDisposition,
        ok: response.ok
      })
      
      // Check if the response is HTML (which should not happen)
      if (contentType.includes('text/html')) {
        throw new Error(`Received HTML response instead of audio data`)
      }
      
      // Check if the response is JSON (error response)
      if (contentType.includes('application/json')) {
        const errorData = await response.json()
        console.error(`[DownloadRetry][${requestId}] Server returned error:`, errorData)
        throw new Error(errorData.message || 'Server returned an error')
      }

      if (!response.ok) {
        throw new Error(`Server returned error: ${response.status} ${response.statusText}`)
      }

      // Convert to blob
      const blob = await response.blob()
      console.log(`[DownloadRetry][${requestId}] Blob received:`, {
        type: blob.type || 'no-type',
        size: blob.size,
        timestamp: new Date().toISOString()
      })

      // Verify the blob size
      if (blob.size < 100 * 1024) {
        console.warn(`[DownloadRetry][${requestId}] Warning: Downloaded file is small (${blob.size} bytes)`)
        
        if (blob.size < 1000) {
          throw new Error(`File is too small (${blob.size} bytes)`)
        }
      }
      
      // Support various audio types, not just MP3
      const acceptedTypes = ['audio/mpeg', 'audio/mp3', 'audio/webm', 'audio/ogg', 'audio/wav', 'audio/']
      const isAudioType = acceptedTypes.some(type => blob.type.includes(type))
      
      // Verify it's an audio type
      if (blob.type && !isAudioType) {
        throw new Error(`Received non-audio data: ${blob.type}`)
      }

      // Create object URL
      const url = URL.createObjectURL(blob)
      console.log(`[DownloadRetry][${requestId}] Created blob URL for download`)

      // Create download link
      const filename = `${trackName.replace(/[^a-z0-9]/gi, "_")}_${artistName.replace(/[^a-z0-9]/gi, "_")}.mp3`
      const link = document.createElement("a")
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      
      console.log(`[DownloadRetry][${requestId}] Download triggered for ${filename}`)

      // Complete progress
      clearInterval(progressInterval)
      setRetryProgress(100)

      // Reset after a delay
      setTimeout(() => {
        setIsRetrying(false)
        setRetryProgress(0)
      }, 2000)

      console.log(`[DownloadRetry][${requestId}] Retry successful for "${trackName}"`)
    } catch (error) {
      console.error(`[DownloadRetry][${requestId}] Retry failed:`, error)
      setError(error instanceof Error ? error.message : String(error))
      setIsRetrying(false)
    }
  }

  const handleAlternativeDownload = () => {
    // Open a reliable YouTube to MP3 converter service
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`
    const converterUrl = `https://www.y2mate.com/youtube-mp3/${videoId}`
    window.open(converterUrl, "_blank")
  }

  return (
    <div className="mt-2">
      {error && (
        <Alert variant="destructive" className="mb-2 py-2">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {isRetrying ? (
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-gray-600 mb-1">
            <span>Retrying download...</span>
            <span>{retryProgress}%</span>
          </div>
          <Progress value={retryProgress} className="h-2" />
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleRetry}>
            <RefreshCw className="h-3 w-3 mr-2" />
            Retry Download
          </Button>

          <Button variant="outline" size="sm" onClick={handleAlternativeDownload}>
            <ExternalLink className="h-3 w-3 mr-2" />
            Alternative Download
          </Button>
        </div>
      )}
    </div>
  )
}
