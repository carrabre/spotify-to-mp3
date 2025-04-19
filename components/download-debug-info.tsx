"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Info, ChevronDown, ChevronUp, RefreshCw } from "lucide-react"

interface DownloadDebugInfoProps {
  videoId: string
  trackName: string
}

export default function DownloadDebugInfo({ videoId, trackName }: DownloadDebugInfoProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [debugInfo, setDebugInfo] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)

  const fetchDebugInfo = async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/ytdl-diagnostic?videoId=${videoId}`)
      const data = await response.json()
      setDebugInfo(data)
    } catch (error) {
      console.error("Error fetching debug info:", error)
      setDebugInfo({ error: "Failed to fetch debug info" })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="mt-2 border rounded-lg overflow-hidden">
      <div
        className="p-2 bg-gray-50 dark:bg-gray-800 flex justify-between items-center cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center">
          <Info className="h-4 w-4 mr-2 text-blue-500" />
          <h3 className="text-sm font-medium">Download Debug Info</h3>
        </div>
        {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </div>

      {isOpen && (
        <div className="p-3 bg-white dark:bg-gray-900 text-sm">
          <div className="space-y-2">
            <div className="flex justify-between">
              <p>
                <strong>Track:</strong> {trackName}
              </p>
              <p>
                <strong>Video ID:</strong> {videoId}
              </p>
            </div>

            <Button variant="outline" size="sm" onClick={fetchDebugInfo} disabled={isLoading} className="w-full">
              {isLoading ? (
                <>
                  <RefreshCw className="mr-2 h-3 w-3 animate-spin" />
                  Fetching Debug Info...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-3 w-3" />
                  Fetch Debug Info
                </>
              )}
            </Button>

            {debugInfo && (
              <div className="mt-2">
                {debugInfo.error ? (
                  <Alert variant="destructive" className="p-2">
                    <AlertDescription>{debugInfo.error}</AlertDescription>
                  </Alert>
                ) : (
                  <div className="space-y-2">
                    <h4 className="font-medium">s-ytdl Test Results:</h4>

                    <div className="bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-x-auto">
                      <pre className="text-xs">{JSON.stringify(debugInfo, null, 2)}</pre>
                    </div>

                    <p className="text-xs text-gray-500">
                      This information can help diagnose download issues. If you're experiencing problems, try using a
                      different quality setting or an alternative download method.
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="mt-2">
              <h4 className="font-medium">Alternative Download Options:</h4>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {["1", "2", "3", "4"].map((quality) => (
                  <Button
                    key={quality}
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      window.open(
                        `/api/ytdl-simple?videoId=${videoId}&title=${encodeURIComponent(trackName)}&quality=${quality}`,
                        "_blank",
                      )
                    }
                  >
                    Quality {quality} (
                    {quality === "1" ? "32" : quality === "2" ? "64" : quality === "3" ? "128" : "192"} kbps)
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
