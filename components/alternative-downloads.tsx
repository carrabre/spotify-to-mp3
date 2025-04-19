"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Info, ChevronDown, ChevronUp, ExternalLink } from "lucide-react"

interface AlternativeDownloadsProps {
  videoId: string
  trackName: string
}

export default function AlternativeDownloads({ videoId, trackName }: AlternativeDownloadsProps) {
  const [isOpen, setIsOpen] = useState(false)

  const services = [
    {
      name: "Y2Mate",
      url: `https://www.y2mate.com/youtube-mp3/${videoId}`,
      description: "Popular YouTube to MP3 converter with high quality options",
    },
    {
      name: "YTMP3.cc",
      url: `https://ytmp3.cc/en/youtube-mp3/${videoId}`,
      description: "Fast converter with no ads",
    },
    {
      name: "SaveFrom.net",
      url: `https://en.savefrom.net/#url=https://www.youtube.com/watch?v=${videoId}`,
      description: "Supports multiple formats and quality options",
    },
    {
      name: "YouTube",
      url: `https://www.youtube.com/watch?v=${videoId}`,
      description: "Open directly on YouTube",
    },
  ]

  return (
    <div className="mt-2 border rounded-lg overflow-hidden">
      <div
        className="p-2 bg-gray-50 dark:bg-gray-800 flex justify-between items-center cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center">
          <Info className="h-4 w-4 mr-2 text-blue-500" />
          <h3 className="text-sm font-medium">Alternative Download Options</h3>
        </div>
        {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </div>

      {isOpen && (
        <div className="p-3 bg-white dark:bg-gray-900 text-sm">
          <Alert className="mb-3">
            <AlertDescription>
              If the direct download isn't working, try one of these alternative services:
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-2 gap-2">
            {services.map((service) => (
              <Button
                key={service.name}
                variant="outline"
                className="flex flex-col items-start h-auto p-3 text-left"
                onClick={() => window.open(service.url, "_blank")}
              >
                <span className="flex items-center font-medium">
                  <ExternalLink className="h-3 w-3 mr-2" />
                  {service.name}
                </span>
                <span className="text-xs text-gray-500 mt-1">{service.description}</span>
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
