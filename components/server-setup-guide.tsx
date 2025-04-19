"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Info, ChevronDown, ChevronUp, Terminal, Check, X } from "lucide-react"

export default function ServerSetupGuide() {
  const [isOpen, setIsOpen] = useState(false)
  const [systemInfo, setSystemInfo] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)

  const checkSystemRequirements = async () => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/system-check")
      const data = await response.json()
      setSystemInfo(data)
    } catch (error) {
      console.error("Error checking system requirements:", error)
      setSystemInfo({ error: "Failed to check system requirements" })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="mt-4 border rounded-lg overflow-hidden">
      <div
        className="p-4 bg-gray-50 dark:bg-gray-800 flex justify-between items-center cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center">
          <Info className="h-5 w-5 mr-2 text-blue-500" />
          <h3 className="font-medium">Server Setup Requirements</h3>
        </div>
        {isOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
      </div>

      {isOpen && (
        <div className="p-4 bg-white dark:bg-gray-900">
          <Alert className="mb-4">
            <AlertDescription>
              This application requires certain dependencies to be installed on the server for MP3 downloads to work
              properly.
            </AlertDescription>
          </Alert>

          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Required Dependencies:</h4>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">yt-dlp</code> - For downloading YouTube
                  videos
                </li>
                <li>
                  <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">ffmpeg</code> - For converting videos to
                  MP3
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-medium mb-2">Installation Instructions:</h4>

              <div className="mb-2">
                <h5 className="font-medium text-sm">Ubuntu/Debian:</h5>
                <div className="bg-gray-100 dark:bg-gray-800 p-2 rounded font-mono text-sm">
                  sudo apt update
                  <br />
                  sudo apt install ffmpeg
                  <br />
                  sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
                  <br />
                  sudo chmod a+rx /usr/local/bin/yt-dlp
                </div>
              </div>

              <div className="mb-2">
                <h5 className="font-medium text-sm">macOS (with Homebrew):</h5>
                <div className="bg-gray-100 dark:bg-gray-800 p-2 rounded font-mono text-sm">
                  brew install ffmpeg yt-dlp
                </div>
              </div>

              <div>
                <h5 className="font-medium text-sm">Windows:</h5>
                <div className="bg-gray-100 dark:bg-gray-800 p-2 rounded font-mono text-sm">
                  # Install with Chocolatey:
                  <br />
                  choco install ffmpeg yt-dlp
                  <br />
                  <br /># Or download manually:
                  <br /># 1. FFmpeg: https://ffmpeg.org/download.html
                  <br /># 2. yt-dlp: https://github.com/yt-dlp/yt-dlp/releases
                </div>
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-2">Vercel Deployment:</h4>
              <p className="text-sm mb-2">
                For Vercel deployments, you'll need to use a custom build script that installs these dependencies. This
                can be done by adding a{" "}
                <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">vercel-build.sh</code> script and
                configuring it in your <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">package.json</code>.
              </p>
              <div className="bg-gray-100 dark:bg-gray-800 p-2 rounded font-mono text-sm">
                # vercel-build.sh
                <br />
                #!/bin/bash
                <br />
                echo "Installing ffmpeg and yt-dlp..."
                <br />
                apt-get update && apt-get install -y ffmpeg
                <br />
                curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
                <br />
                chmod a+rx /usr/local/bin/yt-dlp
                <br />
                echo "Building the application..."
                <br />
                npm run build
              </div>
            </div>

            <div>
              <Button onClick={checkSystemRequirements} disabled={isLoading} className="mt-2">
                <Terminal className="h-4 w-4 mr-2" />
                {isLoading ? "Checking..." : "Check System Requirements"}
              </Button>

              {systemInfo && (
                <div className="mt-4 space-y-2">
                  <h4 className="font-medium">System Check Results:</h4>

                  <div className="flex items-center">
                    <div className="w-6">
                      {systemInfo.ytdlp?.installed ? (
                        <Check className="h-5 w-5 text-green-500" />
                      ) : (
                        <X className="h-5 w-5 text-red-500" />
                      )}
                    </div>
                    <div>
                      <span className="font-medium">yt-dlp:</span>{" "}
                      {systemInfo.ytdlp?.installed ? `Installed (${systemInfo.ytdlp.version})` : "Not installed"}
                    </div>
                  </div>

                  <div className="flex items-center">
                    <div className="w-6">
                      {systemInfo.ffmpeg?.installed ? (
                        <Check className="h-5 w-5 text-green-500" />
                      ) : (
                        <X className="h-5 w-5 text-red-500" />
                      )}
                    </div>
                    <div>
                      <span className="font-medium">ffmpeg:</span>{" "}
                      {systemInfo.ffmpeg?.installed ? "Installed" : "Not installed"}
                    </div>
                  </div>

                  {systemInfo.ytdlp?.testResult && (
                    <div className="flex items-center">
                      <div className="w-6">
                        {systemInfo.ytdlp.testResult.success ? (
                          <Check className="h-5 w-5 text-green-500" />
                        ) : (
                          <X className="h-5 w-5 text-red-500" />
                        )}
                      </div>
                      <div>
                        <span className="font-medium">Download test:</span>{" "}
                        {systemInfo.ytdlp.testResult.success ? "Successful" : "Failed"}
                        {systemInfo.ytdlp.testResult.fileSize &&
                          ` (${Math.round(systemInfo.ytdlp.testResult.fileSize / 1024)} KB)`}
                      </div>
                    </div>
                  )}

                  <div className="mt-2">
                    <Button variant="outline" size="sm" onClick={() => setSystemInfo(null)}>
                      Close Results
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
