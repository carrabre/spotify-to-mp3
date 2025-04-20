"use client"

import Image from "next/image"
import { ExternalLink, Music, Play, Download, Loader2, RefreshCw, Search } from "lucide-react"
import type { Track } from "@/lib/types"
import YouTubePreview from "@/components/youtube-preview"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"

export interface TrackListProps {
  tracks: Track[]
  onVerifyMatch: (track: Track) => Promise<void>
  onSearch: (track: Track) => void
  onDownload: (track: Track) => Promise<void>
  onRetryDownload: (track: Track) => Promise<void>
  downloadingTracks: Record<string, boolean>
  downloadProgress: Record<string, number>
  downloadErrors: Record<string, string>
  matchingTrackIds: Set<string>
  verifyingTrack: string | null
}

export default function TrackList({
  tracks,
  onVerifyMatch,
  onSearch,
  onDownload,
  onRetryDownload,
  downloadingTracks,
  downloadProgress,
  downloadErrors,
  matchingTrackIds,
  verifyingTrack,
}: TrackListProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-700">
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                #
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Download
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Track
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Album
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                YouTube Match
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {tracks.map((track, index) => (
              <tr key={track.id} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{index + 1}</td>
                <td className="px-4 py-2 whitespace-nowrap">
                  {track.youtubeId && track.verified ? (
                    <div className="flex flex-col">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => onDownload(track)}
                        disabled={downloadingTracks[track.id]}
                      >
                        {downloadingTracks[track.id] ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="mr-2 h-4 w-4" />
                        )}
                        {downloadingTracks[track.id] ? "Downloading..." : "Download MP3"}
                      </Button>

                      {downloadingTracks[track.id] && (
                        <div className="mt-2 w-full">
                          <div className="flex justify-between text-xs text-gray-600 mb-1">
                            <span>{downloadProgress[track.id] || 0}%</span>
                          </div>
                          <Progress value={downloadProgress[track.id] || 0} className="h-2" />
                        </div>
                      )}

                      {downloadErrors[track.id] && (
                        <Alert variant="destructive" className="mt-2 py-1 text-xs">
                          <AlertCircle className="h-3 w-3" />
                          <AlertDescription>{downloadErrors[track.id]}</AlertDescription>
                        </Alert>
                      )}

                      {!downloadingTracks[track.id] && downloadErrors[track.id] && (
                        <Button variant="outline" size="sm" onClick={() => onRetryDownload(track)} className="mt-2">
                          <RefreshCw className="mr-1 h-3 w-3" />
                          Retry
                        </Button>
                      )}
                    </div>
                  ) : (
                    <span className="text-sm text-gray-500">Not available</span>
                  )}
                </td>
                <td className="px-4 py-2 whitespace-nowrap">
                  <div className="flex items-center">
                    {track.youtubeThumbnail ? (
                      <Image
                        src={track.youtubeThumbnail}
                        alt={track.album || ""}
                        width={40}
                        height={40}
                        className="rounded-sm"
                      />
                    ) : (
                      <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-sm flex items-center justify-center">
                        <Music className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                      </div>
                    )}
                    <div className="ml-3">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{track.name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {track.artists ? track.artists.join(", ") : track.artist}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{track.album}</td>
                <td className="px-4 py-2 whitespace-nowrap">
                  {track.youtubeId ? (
                    <div className="flex items-center">
                      {/* YouTube Thumbnail with Link */}
                      <a
                        href={`https://www.youtube.com/watch?v=${track.youtubeId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mr-3 flex-shrink-0"
                      >
                        <Image
                          src={`https://i.ytimg.com/vi/${track.youtubeId}/mqdefault.jpg`}
                          alt={track.youtubeTitle || track.name}
                          width={60}
                          height={45}
                          className="rounded-sm hover:opacity-90 transition-opacity"
                        />
                      </a>
                      <div>
                        <a
                          href={`https://www.youtube.com/watch?v=${track.youtubeId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center"
                        >
                          <span className="truncate max-w-xs">{track.youtubeTitle || `${track.name} (YouTube)`}</span>
                          <ExternalLink className="ml-1 h-3 w-3" />
                        </a>
                        <YouTubePreview videoId={track.youtubeId} title={track.name}>
                          <button className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center mt-1">
                            <Play className="h-3 w-3 mr-1" />
                            Preview
                          </button>
                        </YouTubePreview>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center">
                      <Button variant="outline" size="sm" onClick={() => onSearch(track)}>
                        <Search className="mr-2 h-4 w-4" />
                        Search on YouTube
                      </Button>
                    </div>
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
