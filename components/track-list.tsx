"use client"

import Image from "next/image"
import { ExternalLink, Music, Play, Download, Loader2, RefreshCw } from "lucide-react"
import type { Track } from "@/lib/types"
import YouTubePreview from "@/components/youtube-preview"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"

interface TrackListProps {
  tracks: Track[]
  onDownload: (track: Track) => void
  onRetry: (track: Track) => void
  downloadingTracks: Record<string, boolean>
  downloadProgress: Record<string, number>
  downloadErrors: Record<string, string>
}

export default function TrackList({
  tracks,
  onDownload,
  onRetry,
  downloadingTracks,
  downloadProgress,
  downloadErrors,
}: TrackListProps) {
  return (
    <div className="bg-white/80 dark:bg-gray-800/50 backdrop-blur-lg rounded-xl shadow-xl overflow-hidden border border-gray-200 dark:border-gray-700">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50/50 dark:bg-gray-700/50">
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                #
              </th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                Download
              </th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                Track
              </th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                Album
              </th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                YouTube Match
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200/50 dark:divide-gray-700/50">
            {tracks.map((track, index) => (
              <tr 
                key={track.id} 
                className="hover:bg-gray-50/50 dark:hover:bg-gray-700/50 transition-colors group"
              >
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  {index + 1}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {track.youtubeId && track.verified ? (
                    <div className="flex flex-col gap-2 min-w-[180px]">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => onDownload(track)}
                        disabled={downloadingTracks[track.id]}
                        className={`w-full bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700 text-white shadow-md hover:shadow-lg transition-all ${
                          downloadingTracks[track.id] ? 'animate-pulse' : ''
                        }`}
                      >
                        {downloadingTracks[track.id] ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="mr-2 h-4 w-4" />
                        )}
                        {downloadingTracks[track.id] ? "Downloading..." : "Download MP3"}
                      </Button>

                      {downloadingTracks[track.id] && (
                        <div className="w-full">
                          <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                            <span>{downloadProgress[track.id] || 0}%</span>
                          </div>
                          <Progress 
                            value={downloadProgress[track.id] || 0} 
                            className="h-1.5 bg-gray-200 dark:bg-gray-700"
                          >
                            <div
                              className="h-full bg-green-500 dark:bg-green-400 rounded-full transition-all duration-500"
                              style={{ width: `${downloadProgress[track.id]}%` }}
                            />
                          </Progress>
                        </div>
                      )}

                      {downloadErrors[track.id] && (
                        <Alert variant="destructive" className="py-2 text-xs bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
                          <AlertCircle className="h-3 w-3" />
                          <AlertDescription className="text-red-800 dark:text-red-200">
                            {downloadErrors[track.id]}
                          </AlertDescription>
                        </Alert>
                      )}

                      {!downloadingTracks[track.id] && downloadErrors[track.id] && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => onRetry(track)}
                          className="w-full border-2 hover:border-green-500 hover:text-green-600 dark:hover:border-green-400 dark:hover:text-green-400 transition-colors"
                        >
                          <RefreshCw className="mr-1 h-3 w-3" />
                          Retry
                        </Button>
                      )}
                    </div>
                  ) : (
                    <span className="text-sm text-gray-500 dark:text-gray-400">Not available</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    {track.albumImageUrl ? (
                      <div className="relative w-12 h-12 rounded-lg overflow-hidden shadow-md group-hover:shadow-lg transition-shadow">
                        <Image
                          src={track.albumImageUrl}
                          alt={track.album}
                          fill
                          className="object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center shadow-md">
                        <Music className="w-6 h-6 text-gray-500 dark:text-gray-400" />
                      </div>
                    )}
                    <div className="ml-4">
                      <div className="text-base font-medium text-gray-900 dark:text-gray-100">
                        {track.name}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {track.artists.join(", ")}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  {track.album}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {track.youtubeId ? (
                    <div className="flex items-center">
                      <a
                        href={`https://www.youtube.com/watch?v=${track.youtubeId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mr-4 flex-shrink-0 relative w-20 h-15 rounded-lg overflow-hidden shadow-md hover:shadow-lg transition-shadow"
                      >
                        <Image
                          src={`https://i.ytimg.com/vi/${track.youtubeId}/mqdefault.jpg`}
                          alt={track.youtubeTitle || track.name}
                          fill
                          className="object-cover hover:opacity-90 transition-opacity"
                        />
                      </a>
                      <div>
                        <a
                          href={`https://www.youtube.com/watch?v=${track.youtubeId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center group transition-colors"
                        >
                          <span className="truncate max-w-xs group-hover:underline">
                            {track.youtubeTitle || `${track.name} (YouTube)`}
                          </span>
                          <ExternalLink className="ml-1 h-3 w-3 opacity-75 group-hover:opacity-100" />
                        </a>
                        <YouTubePreview videoId={track.youtubeId} title={track.name}>
                          <button className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex items-center mt-2 group transition-colors">
                            <Play className="h-3 w-3 mr-1 group-hover:text-green-500 dark:group-hover:text-green-400" />
                            Preview
                          </button>
                        </YouTubePreview>
                      </div>
                    </div>
                  ) : (
                    <span className="text-sm text-red-500 dark:text-red-400">No match found</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
