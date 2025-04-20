"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Download, Music, Copy, Check } from "lucide-react"
import type { Track } from "@/lib/types"

interface DownloadModalProps {
  isOpen: boolean
  onClose: () => void
  track: Track | null
}

export default function DownloadModal({ isOpen, onClose, track }: DownloadModalProps) {
  const [copied, setCopied] = useState(false)

  if (!track || !track.youtubeId) return null

  const youtubeUrl = `https://www.youtube.com/watch?v=${track.youtubeId}`
  const artistString = track.artists?.join("_") || track.artist
  const sanitizedFilename = `${track.name.replace(/[^a-z0-9]/gi, "_")}_${artistString.replace(/[^a-z0-9]/gi, "_")}.mp3`

  const downloadServices = [
    {
      name: "Y2Mate",
      url: `https://www.y2mate.com/youtube-mp3/${track.youtubeId}`,
      description: "Popular YouTube to MP3 converter with high quality options",
    },
    {
      name: "YTMP3.cc",
      url: `https://ytmp3.cc/youtube-to-mp3/?url=${encodeURIComponent(youtubeUrl)}`,
      description: "Fast converter with no ads",
    },
    {
      name: "OnlineVideoConverter",
      url: `https://www.onlinevideoconverter.com/youtube-converter?url=${encodeURIComponent(youtubeUrl)}`,
      description: "Supports multiple formats and quality options",
    },
    {
      name: "SaveFrom.net",
      url: `https://en.savefrom.net/#url=${encodeURIComponent(youtubeUrl)}`,
      description: "Fast downloads with multiple quality options",
    },
  ]

  const handleCopyYouTubeUrl = () => {
    navigator.clipboard.writeText(youtubeUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-lg">Download "{track.name}"</DialogTitle>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          <Alert>
            <AlertDescription>
              Due to server limitations, we recommend using one of these reliable external services to download your
              MP3.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <h3 className="font-medium">Download Options:</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {downloadServices.map((service) => (
                <Button
                  key={service.name}
                  variant="outline"
                  className="justify-start h-auto py-2"
                  onClick={() => window.open(service.url, "_blank")}
                >
                  <div className="flex flex-col items-start text-left">
                    <span className="flex items-center">
                      <Download className="h-4 w-4 mr-2" />
                      {service.name}
                    </span>
                    <span className="text-xs text-gray-500 mt-1">{service.description}</span>
                  </div>
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="font-medium">Other Options:</h3>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={handleCopyYouTubeUrl}>
                {copied ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy YouTube URL
                  </>
                )}
              </Button>

              <Button variant="outline" onClick={() => window.open(youtubeUrl, "_blank")}>
                <Music className="h-4 w-4 mr-2" />
                Open on YouTube
              </Button>
            </div>
          </div>

          <div className="pt-2 border-t">
            <p className="text-sm text-gray-500">
              <strong>Tip:</strong> For the best experience, we recommend using a browser extension like "YouTube MP3
              Downloader" or a desktop application like "4K Video Downloader" for high-quality downloads.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
