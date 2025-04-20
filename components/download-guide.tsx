"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Info, ChevronDown, ChevronUp, Download } from "lucide-react"

export default function DownloadGuide() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="mt-4 border rounded-lg overflow-hidden">

      {isOpen && (
        <div className="p-4 bg-white dark:bg-gray-900">
          <Alert className="mb-4">
            <AlertDescription>
              Due to technical limitations, we use external services to convert YouTube videos to MP3 files. Here's how
              to download your tracks:
            </AlertDescription>
          </Alert>

          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Step 1: Find Your Track</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                After pasting a Spotify URL, we'll automatically match your tracks with YouTube videos. You can verify
                and change these matches if needed.
              </p>
            </div>

            <div>
              <h4 className="font-medium mb-2">Step 2: Download MP3</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Click the "Download MP3" button for any track. This will open a dialog with several download options.
              </p>
            </div>

            <div>
              <h4 className="font-medium mb-2">Step 3: Choose a Download Service</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Select one of the recommended download services. Each service will open in a new tab where you can
                complete the download process.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" disabled>
                  <Download className="h-4 w-4 mr-2" />
                  Y2Mate
                </Button>
                <Button variant="outline" size="sm" disabled>
                  <Download className="h-4 w-4 mr-2" />
                  YTMP3.cc
                </Button>
                <Button variant="outline" size="sm" disabled>
                  <Download className="h-4 w-4 mr-2" />
                  OnlineVideoConverter
                </Button>
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-2">Alternative Methods</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">For the best experience, consider using:</p>
              <ul className="list-disc pl-5 space-y-1 text-sm text-gray-600 dark:text-gray-400 mt-1">
                <li>Browser extensions like "YouTube MP3 Downloader" or "Video DownloadHelper"</li>
                <li>Desktop applications like "4K Video Downloader" or "JDownloader"</li>
                <li>Online services like y2mate.com, ytmp3.cc, or onlinevideoconverter.com</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
