"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Download, Loader2, CheckCircle2, AlertCircle, X } from "lucide-react"
import { useDownloadStore } from "@/lib/stores/download-store"
import type { Track } from "@/lib/types"

interface ZipDownloadModalProps {
  isOpen: boolean
  onClose: () => void
  tracks: Track[]
}

export default function ZipDownloadModal({ isOpen, onClose, tracks }: ZipDownloadModalProps) {
  const {
    isDownloading,
    progress,
    currentTrack,
    processedCount,
    totalTracks,
    error,
    startDownload,
    setDownloadState
  } = useDownloadStore()

  const [status, setStatus] = useState<"idle" | "downloading" | "complete" | "error">("idle")

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStatus("idle")
    }
  }, [isOpen])

  // Filter out tracks without YouTube IDs
  const downloadableTracks = tracks.filter((track) => track.youtubeId)

  const downloadZip = async () => {
    if (downloadableTracks.length === 0) return

    console.log(`[ZipModal] Starting ZIP download for ${downloadableTracks.length} tracks`)
    const abortController = startDownload()
    setStatus("downloading")

    let accumulatedData = '';
    let isCompleteEvent = false;

    try {
      // Call our ZIP download endpoint
      const response = await fetch('/api/zip-download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tracks: downloadableTracks }),
        signal: abortController.signal
      })

      if (!response.ok) {
        throw new Error(`Failed to start download: ${response.status} ${response.statusText}`)
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('Unable to read response')
      }

      // Process the stream
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        // Decode the chunk
        const chunk = decoder.decode(value)
        
        // Check if this is a progress update or the complete event
        if (chunk.includes('"type":"complete"')) {
          isCompleteEvent = true;
          accumulatedData += chunk;
        } else if (!isCompleteEvent) {
          try {
            // Try to parse as a progress update
            const events = chunk.split('\n\n')
            for (const event of events) {
              if (!event.trim() || !event.startsWith('data: ')) continue
              const data = JSON.parse(event.slice(5))
              
              if (data.type === 'error') {
                console.error('[ZipModal] Received error:', data.message);
                setDownloadState({
                  error: data.message,
                  isDownloading: false
                })
                setStatus("error")
                return
              }

              if (data.progress !== undefined) {
                console.log('[ZipModal] Progress update:', data.progress + '%');
                setDownloadState({
                  progress: data.progress,
                  currentTrack: data.currentTrack,
                  processedCount: data.processed,
                  totalTracks: data.total
                })
              }
            }
          } catch (e) {
            // Ignore parsing errors for progress updates
          }
        } else {
          // Accumulate data chunks
          accumulatedData += chunk;
        }
      }

      // Process the complete ZIP data
      if (isCompleteEvent && accumulatedData) {
        try {
          // Extract the data array from the accumulated string
          const startMarker = '"data":[';
          const startIndex = accumulatedData.indexOf(startMarker) + startMarker.length;
          const endIndex = accumulatedData.lastIndexOf(']');
          
          if (startIndex > 0 && endIndex > startIndex) {
            const dataArrayStr = accumulatedData.slice(startIndex, endIndex);
            const dataArray = dataArrayStr.split(',').map(Number);
            
            // Create the ZIP file
            const zipData = new Uint8Array(dataArray);
            console.log('[ZipModal] Created Uint8Array with length:', zipData.length);
            
            const blob = new Blob([zipData], { type: 'application/zip' });
            console.log('[ZipModal] Created blob with size:', blob.size);
            
            const url = URL.createObjectURL(blob);
            console.log('[ZipModal] Created object URL:', url);
            
            // Create and trigger download
            const a = document.createElement('a');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `spotify-tracks-${timestamp}.zip`;
            a.href = url;
            a.download = filename;
            a.style.display = 'none';
            
            document.body.appendChild(a);
            console.log('[ZipModal] Triggering download for:', filename);
            a.click();
            
            setTimeout(() => {
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
              console.log('[ZipModal] Cleaned up download resources');
            }, 1000);
            
            setDownloadState({
              progress: 100,
              isDownloading: false,
              currentTrack: null,
              processedCount: totalTracks,
            });
            setStatus("complete");
            console.log('[ZipModal] Download process completed successfully');
          } else {
            throw new Error('Could not find ZIP data markers in response');
          }
        } catch (error) {
          console.error('[ZipModal] Error processing ZIP data:', error);
          setDownloadState({
            error: 'Failed to process ZIP file. Please try again.',
            isDownloading: false
          });
          setStatus("error");
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('[ZipModal] Download cancelled')
        return
      }

      console.error('[ZipModal] Error downloading ZIP:', error)
      setDownloadState({
        error: error instanceof Error ? error.message : 'Failed to download ZIP file',
        isDownloading: false
      })
      setStatus("error")
    }
  }

  // Allow closing the modal while download is in progress
  const handleClose = () => {
    if (!isDownloading) {
      onClose()
    } else {
      // Just hide the modal but keep the download running
      onClose()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-lg">Download All Tracks ({downloadableTracks.length})</DialogTitle>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          {status === "idle" && (
            <>
              <Alert>
                <AlertDescription>
                  This will download all {downloadableTracks.length} tracks as a single ZIP file.
                  The process may take a few minutes. You can close this window while downloading.
                </AlertDescription>
              </Alert>

              <Button
                onClick={downloadZip}
                disabled={isDownloading || downloadableTracks.length === 0}
                className="w-full"
              >
                <Download className="mr-2 h-4 w-4" />
                Download ZIP
              </Button>
            </>
          )}

          {status === "downloading" && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-medium">Creating ZIP file...</h3>
                  <p className="text-sm text-gray-500">
                    {currentTrack ? (
                      <>Processing: {currentTrack}</>
                    ) : (
                      <>Please wait while we process your tracks</>
                    )}
                  </p>
                  <p className="text-sm text-gray-500">
                    {processedCount} of {totalTracks} tracks processed
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={handleClose}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <Progress value={progress} className="h-2" />

              <div className="flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
              </div>

              <Alert>
                <AlertDescription>
                  You can close this window. The download will continue in the background.
                </AlertDescription>
              </Alert>
            </div>
          )}

          {status === "complete" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-5 w-5" />
                <span>Download Complete!</span>
              </div>
              <p className="text-sm text-gray-500">
                If your download hasn't started automatically, click the button below.
              </p>
              <Button onClick={downloadZip} className="w-full">
                <Download className="mr-2 h-4 w-4" />
                Download Again
              </Button>
            </div>
          )}

          {status === "error" && (
            <div className="space-y-4">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {error || "Failed to create ZIP file. Please try downloading tracks individually."}
                </AlertDescription>
              </Alert>

              <div className="flex justify-between">
                <Button variant="outline" onClick={handleClose}>
                  Close
                </Button>
                <Button onClick={downloadZip}>Try Again</Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
