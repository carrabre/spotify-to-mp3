"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Download, Music, Copy, Check, ExternalLink } from "lucide-react"
import type { Track } from "@/lib/types"

interface DownloadModalProps {
  isOpen: boolean
  onClose: () => void
  track: Track
}

export default function DownloadModal({ isOpen, onClose, track }: DownloadModalProps) {
  const [copied, setCopied] = useState(false)

  if (!track.youtubeId) return null

  const youtubeUrl = `https://www.youtube.com/watch?v=${track.youtubeId}`
  const sanitizedFilename = `${track.name.replace(/[^a-z0-9]/gi, "_")}_${track.artists.join("_").replace(/[^a-z0-9]/gi, "_")}.mp3`

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
      <DialogContent className="sm:max-w-xl bg-white/80 dark:bg-gray-800/50 backdrop-blur-lg border-gray-200 dark:border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-gray-900 dark:text-gray-100">
            Alternative Download Options
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="flex items-center gap-4 p-4 bg-gray-50/50 dark:bg-gray-700/50 rounded-xl">
            <div className="relative w-16 h-16 rounded-lg overflow-hidden shadow-md">
              {track.albumImageUrl ? (
                <img
                  src={track.albumImageUrl}
                  alt={track.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center">
                  <Music className="w-8 h-8 text-gray-400" />
                </div>
              )}
            </div>
            <div>
              <h3 className="font-medium text-gray-900 dark:text-gray-100">{track.name}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">{track.artists.join(", ")}</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-4 p-4 bg-gray-50/50 dark:bg-gray-700/50 rounded-xl">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {youtubeUrl}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyYouTubeUrl}
                className="flex-shrink-0 border-2 hover:border-green-500 hover:text-green-600 dark:hover:border-green-400 dark:hover:text-green-400 transition-colors"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                <span className="ml-2">{copied ? "Copied!" : "Copy URL"}</span>
              </Button>
            </div>

            <Alert className="bg-blue-50/50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
              <AlertDescription className="text-blue-800 dark:text-blue-200">
                If the direct download failed, you can try these alternative services:
              </AlertDescription>
            </Alert>

            <div className="grid gap-3">
              {downloadServices.map((service) => (
                <a
                  key={service.name}
                  href={service.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-green-500 dark:hover:border-green-400 group transition-colors"
                >
                  <div className="space-y-1">
                    <div className="font-medium text-gray-900 dark:text-gray-100 group-hover:text-green-600 dark:group-hover:text-green-400">
                      {service.name}
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {service.description}
                    </p>
                  </div>
                  <ExternalLink className="h-5 w-5 text-gray-400 group-hover:text-green-500 dark:group-hover:text-green-400" />
                </a>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
