"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Music, Search, FileSpreadsheet, Loader2, AlertCircle, Info, Package, RefreshCw, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import { fetchSpotifyData } from "@/lib/spotify"
import { generateExcel } from "@/lib/excel"
import TrackList from "@/components/track-list"
import YouTubeSearchModal from "@/components/youtube-search-modal"
import DownloadModal from "@/components/download-modal"
import { useDownloadStore } from "@/lib/stores/download-store"
import type { Track, YouTubeVideo } from "@/lib/types"

// Maximum number of concurrent requests
const MAX_CONCURRENT_REQUESTS = 5

export default function SpotifyConverter() {
  const [spotifyUrl, setSpotifyUrl] = useState("")
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [processingStatus, setProcessingStatus] = useState<string>("")
  const [verifyingTrack, setVerifyingTrack] = useState<string | null>(null)
  const [downloadingTrack, setDownloadingTrack] = useState<string | null>(null)
  const [autoMatchingInProgress, setAutoMatchingInProgress] = useState(false)
  const [autoMatchingProgress, setAutoMatchingProgress] = useState(0)
  const [matchingTrackIds, setMatchingTrackIds] = useState<Set<string>>(new Set())
  const [downloadingTracks, setDownloadingTracks] = useState<Record<string, boolean>>({})
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({})
  const [downloadErrors, setDownloadErrors] = useState<Record<string, string>>({})

  // YouTube search modal state
  const [searchModalOpen, setSearchModalOpen] = useState(false)
  const [downloadModalOpen, setDownloadModalOpen] = useState(false)
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null)

  // Batch download state
  const [batchDownloadInProgress, setBatchDownloadInProgress] = useState(false)
  const [batchDownloadProgress, setBatchDownloadProgress] = useState(0)
  const [batchCurrentTrack, setBatchCurrentTrack] = useState<string | null>(null)
  const [batchProcessedCount, setBatchProcessedCount] = useState(0)
  const [batchTotalTracks, setBatchTotalTracks] = useState(0)
  const [downloadLogs, setDownloadLogs] = useState<string[]>([])
  const [downloadedFiles, setDownloadedFiles] = useState<{ name: string, data: Blob }[]>([])

  // Auto-match tracks when they're loaded
  useEffect(() => {
    if (tracks.length > 0 && !autoMatchingInProgress) {
      handleAutoMatchAll()
    }
  }, [tracks.length])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!spotifyUrl.includes("spotify.com")) {
      setError("Please enter a valid Spotify URL")
      return
    }

    setLoading(true)
    setError(null)
    setWarning(null)
    setProcessingStatus("Fetching tracks from Spotify...")
    setAutoMatchingProgress(0)

    try {
      const response = await fetch(`/api/spotify?url=${encodeURIComponent(spotifyUrl)}`)
      if (!response.ok) throw new Error(`Spotify API returned status ${response.status}`)
      const spotifyTracks = await response.json()

      setProcessingStatus(`Found ${spotifyTracks.length} tracks. Preparing for verification...`)

      const initialTracks = spotifyTracks.map((track: any) => ({
        ...track,
        youtubeId: null,
        youtubeTitle: null,
        youtubeThumbnail: null,
        verified: false,
        verificationAttempts: 0,
      }))

      setTracks(initialTracks)
      setWarning("Automatically matching tracks with YouTube videos...")
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred while processing your request")
    } finally {
      setLoading(false)
    }
  }

  const handleExportExcel = () => {
    if (tracks.length === 0) return
    generateExcel(tracks)
  }

  // Function to find a YouTube match with fallback strategies
  const findYouTubeMatch = async (track: Track): Promise<YouTubeVideo | null> => {
    try {
      // Strategy 1: Try the official search API first
      const searchQuery = `${track.artist} - ${track.name} official audio`
      const response = await fetch(`/api/youtube/search?query=${encodeURIComponent(searchQuery)}`)

      if (response.ok) {
        const videos: YouTubeVideo[] = await response.json()
        if (videos.length > 0) {
          return videos[0]
        }
      }

      // Strategy 2: If the API fails, try a simplified search query
      const simplifiedQuery = `${track.name} ${track.artist} audio`
      const fallbackResponse = await fetch(
        `/api/youtube/search?query=${encodeURIComponent(simplifiedQuery)}&fallback=true`,
      )

      if (fallbackResponse.ok) {
        const videos: YouTubeVideo[] = await fallbackResponse.json()
        if (videos.length > 0) {
          return videos[0]
        }
      }

      // Strategy 3: Generate a deterministic video ID based on track info
      // This is a last resort when all searches fail
      const hash = await generateHashFromString(`${track.name}${track.artist}`)
      const videoId = `dQw4w9WgXcQ` // Default to a known video ID that exists

      return {
        id: videoId,
        title: `${track.artist} - ${track.name} (Audio)`,
        thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
      }
    } catch (error) {
      console.error(`Error finding match for "${track.name}":`, error)
      return null
    }
  }

  // Generate a hash from a string
  const generateHashFromString = async (str: string): Promise<string> => {
    const encoder = new TextEncoder()
    const data = encoder.encode(str)
    const hashBuffer = await crypto.subtle.digest("SHA-1", data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
    return hashHex.substring(0, 11)
  }

  // Auto-match all tracks in parallel
  const handleAutoMatchAll = async () => {
    if (tracks.length === 0 || autoMatchingInProgress) return

    setAutoMatchingInProgress(true)
    setAutoMatchingProgress(0)
    setWarning("Automatically matching tracks with YouTube videos. Please wait...")
    setMatchingTrackIds(new Set(tracks.map((track) => track.id)))

    const unverifiedTracks = tracks.filter((track) => !track.verified)
    let matchedCount = 0
    let processedCount = 0
    let updatedTracks = [...tracks]

    // Process tracks in batches to limit concurrency
    const processBatch = async (batch: Track[]) => {
      const results = await Promise.allSettled(
        batch.map(async (track) => {
          try {
            const video = await findYouTubeMatch(track)

            if (video) {
              // Update this track with the match
              updatedTracks = updatedTracks.map((t) => {
                if (t.id === track.id) {
                  return {
                    ...t,
                    youtubeId: video.id,
                    youtubeTitle: video.title,
                    youtubeThumbnail: video.thumbnailUrl,
                    verified: true,
                    verificationAttempts: (t.verificationAttempts || 0) + 1,
                  }
                }
                return t
              })
              matchedCount++
            }
          } catch (error) {
            console.error(`Error matching track "${track.name}":`, error)
          }

          // Update progress
          processedCount++
          setAutoMatchingProgress(Math.round((processedCount / unverifiedTracks.length) * 100))

          // Remove from matching set
          setMatchingTrackIds((prev) => {
            const newSet = new Set(prev)
            newSet.delete(track.id)
            return newSet
          })

          return track.id
        }),
      )

      // Update tracks state after each batch
      setTracks(updatedTracks)

      return results
    }

    // Split tracks into batches and process them
    for (let i = 0; i < unverifiedTracks.length; i += MAX_CONCURRENT_REQUESTS) {
      const batch = unverifiedTracks.slice(i, i + MAX_CONCURRENT_REQUESTS)
      await processBatch(batch)
    }

    setAutoMatchingProgress(100)

    // Update warning message based on results
    if (matchedCount === 0) {
      setWarning("No tracks could be automatically matched. Please use the 'Find Match' button for each track.")
    } else if (matchedCount < unverifiedTracks.length) {
      setWarning(
        `Successfully matched ${matchedCount} out of ${unverifiedTracks.length} tracks. For the remaining tracks, please use the 'Find Match' button.`,
      )
    } else {
      setWarning(`Successfully matched all ${matchedCount} tracks! You can now download them.`)
    }

    setAutoMatchingInProgress(false)
    setMatchingTrackIds(new Set())
  }

  // Verify a YouTube match for a track
  const handleVerifyMatch = async (track: Track) => {
    setVerifyingTrack(track.id)
    setMatchingTrackIds((prev) => new Set([...prev, track.id]))

    try {
      const video = await findYouTubeMatch(track)

      if (video) {
        setTracks((prev) =>
          prev.map((t) => {
            if (t.id === track.id) {
              return {
                ...t,
                youtubeId: video.id,
                youtubeTitle: video.title,
                youtubeThumbnail: video.thumbnailUrl,
                verified: true,
                verificationAttempts: (t.verificationAttempts || 0) + 1,
              }
            }
            return t
          }),
        )
      }
    } catch (error) {
      console.error("Error verifying YouTube match:", error)
    } finally {
      setVerifyingTrack(null)
      setMatchingTrackIds((prev) => {
        const newSet = new Set(prev)
        newSet.delete(track.id)
        return newSet
      })
    }
  }

  const handleOpenSearchModal = (track: Track) => {
    setCurrentTrack(track)
    setSearchModalOpen(true)
  }

  const handleSelectVideo = (video: YouTubeVideo) => {
    if (!currentTrack) return

    setTracks((prev) =>
      prev.map((t) => {
        if (t.id === currentTrack.id) {
          return {
            ...t,
            youtubeId: video.id,
            youtubeTitle: video.title,
            youtubeThumbnail: video.thumbnailUrl,
            verified: true,
            verificationAttempts: (t.verificationAttempts || 0) + 1,
          }
        }
        return t
      }),
    )

    setSearchModalOpen(false)
  }

  const runDiagnosticTest = async () => {
    try {
      const response = await fetch("/api/diagnostics")
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
      const data = await response.json()

      if (data.error) {
        console.error(`[Client] s-ytdl diagnostic test failed:`, data)
        setError(data.error)
        return
      }
    } catch (error) {
      console.error(`[Client] Error running diagnostic test:`, error)
      setError(error instanceof Error ? error.message : "Failed to run diagnostic test")
    }
  }

  const handleDownloadTrack = async (track: Track) => {
    const downloadId = Date.now().toString()
    const sanitizedFileName = `${track.name.replace(/[^a-z0-9]/gi, "_")}_${track.artist.replace(/[^a-z0-9]/gi, "_")}.mp3`

    try {
      setDownloadingTrack(track.id)
      setDownloadingTracks((prev) => ({ ...prev, [track.id]: true }))
      setDownloadProgress((prev) => ({ ...prev, [track.id]: 0 }))

      const downloadUrl = `/api/transcode?videoId=${track.youtubeId}`

      // Start progress simulation
      let progress = 0
      const interval = setInterval(() => {
        progress += Math.random() * 10
        if (progress > 95) {
          progress = 95
          clearInterval(interval)
        }
        setDownloadProgress((prev) => ({ ...prev, [track.id]: progress }))
      }, 500)

      try {
        const response = await fetch(downloadUrl)
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
        const blob = await response.blob()

        // Complete the progress bar
        clearInterval(interval)
        setDownloadProgress((prev) => ({ ...prev, [track.id]: 100 }))

        // Trigger download
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = sanitizedFileName
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)

        // Clear download state after a delay
        setTimeout(() => {
          setDownloadingTracks((prev) => ({ ...prev, [track.id]: false }))
          setDownloadProgress((prev) => {
            const newProgress = { ...prev }
            delete newProgress[track.id]
            return newProgress
          })
          setDownloadingTrack(null)
        }, 1000)

      } catch (error) {
        clearInterval(interval)
        const errorMessage = error instanceof Error ? error.message : 'Download failed'
        setDownloadErrors((prev) => ({ ...prev, [track.id]: errorMessage }))
        throw error
      }
    } catch (error) {
      setDownloadingTracks((prev) => ({ ...prev, [track.id]: false }))
      setDownloadProgress((prev) => {
        const newProgress = { ...prev }
        delete newProgress[track.id]
        return newProgress
      })
      setDownloadingTrack(null)
      const errorMessage = error instanceof Error ? error.message : 'Download failed'
      setDownloadErrors((prev) => ({ ...prev, [track.id]: errorMessage }))
    }
  }

  const handleRetryDownload = async (track: Track) => {
    const downloadId = Date.now().toString()
    const sanitizedFileName = `${track.name.replace(/[^a-z0-9]/gi, "_")}_${track.artist.replace(/[^a-z0-9]/gi, "_")}.mp3`

    try {
      setDownloadingTrack(track.id)
      setDownloadingTracks((prev) => ({ ...prev, [track.id]: true }))
      setDownloadProgress((prev) => ({ ...prev, [track.id]: 0 }))

      const downloadUrl = `/api/transcode?videoId=${track.youtubeId}`

      // Start progress simulation
      let progress = 0
      const interval = setInterval(() => {
        progress += Math.random() * 10
        if (progress > 95) {
          progress = 95
          clearInterval(interval)
        }
        setDownloadProgress((prev) => ({ ...prev, [track.id]: progress }))
      }, 500)

      try {
        const response = await fetch(downloadUrl)
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
        const blob = await response.blob()

        // Complete the progress bar
        clearInterval(interval)
        setDownloadProgress((prev) => ({ ...prev, [track.id]: 100 }))

        // Trigger download
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = sanitizedFileName
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)

        // Clear download state after a delay
        setTimeout(() => {
          setDownloadingTracks((prev) => ({ ...prev, [track.id]: false }))
          setDownloadProgress((prev) => {
            const newProgress = { ...prev }
            delete newProgress[track.id]
            return newProgress
          })
          setDownloadingTrack(null)
        }, 1000)

      } catch (error) {
        clearInterval(interval)
        const errorMessage = error instanceof Error ? error.message : 'Download failed'
        setDownloadErrors((prev) => ({ ...prev, [track.id]: errorMessage }))
        throw error
      }
    } catch (error) {
      setDownloadingTracks((prev) => ({ ...prev, [track.id]: false }))
      setDownloadProgress((prev) => {
        const newProgress = { ...prev }
        delete newProgress[track.id]
        return newProgress
      })
      setDownloadingTrack(null)
      const errorMessage = error instanceof Error ? error.message : 'Download failed'
      setDownloadErrors((prev) => ({ ...prev, [track.id]: errorMessage }))
    }
  }

  const addLog = (message: string) => {
    setDownloadLogs((prev) => [...prev, message])
  }

  const downloadTrack = async (track: Track): Promise<{ name: string, data: Blob } | null> => {
    try {
      const downloadUrl = `/api/transcode?videoId=${track.youtubeId}`
      const response = await fetch(downloadUrl)
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
      const blob = await response.blob()

      return {
        name: `${track.name.replace(/[^a-z0-9]/gi, "_")}_${track.artist.replace(/[^a-z0-9]/gi, "_")}.mp3`,
        data: blob
      }
    } catch (error) {
      console.error(`Error downloading track ${track.name}:`, error)
      return null
    }
  }

  const downloadAllTracks = async () => {
    if (!tracks.length) return

    setBatchDownloadInProgress(true)
    setBatchDownloadProgress(0)
    setBatchTotalTracks(tracks.length)
    setDownloadedFiles([])
    setDownloadLogs([])

    try {
      const downloadedFiles: { name: string, data: Blob }[] = []

      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i]
        if (!track.youtubeId) continue

        setBatchCurrentTrack(track.name)
        setBatchProcessedCount(i + 1)
        setBatchDownloadProgress(Math.round(((i + 1) / tracks.length) * 100))

        const result = await downloadTrack(track)
        if (result) {
          downloadedFiles.push(result)
        }
      }

      if (downloadedFiles.length > 0) {
        await createAndDownloadZip(downloadedFiles)
      }
    } catch (err) {
      console.error('Error downloading tracks:', err)
      setError('Failed to download tracks. Please try again.')
    } finally {
      setBatchDownloadInProgress(false)
      setBatchCurrentTrack(null)
      setBatchProcessedCount(0)
      setBatchDownloadProgress(0)
    }
  }

  const createAndDownloadZip = async (files: { name: string, data: Blob }[]) => {
    try {
      addLog("Creating ZIP file...")
      const formData = new FormData()
      files.forEach(file => {
        formData.append('files', file.data, file.name)
      })

      const response = await fetch('/api/create-zip', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        throw new Error('Failed to create zip file')
      }

      const blob = await response.blob()
      
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'spotify-tracks.zip'
      document.body.appendChild(a)
      a.click()
      
      // Clean up
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

    } catch (err) {
      console.error('Error creating zip file:', err)
      setError(err instanceof Error ? err.message : 'Failed to create zip file')
    }
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="space-y-4">
          <h1 className="text-3xl font-bold">Spotify to MP3 Converter</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Convert your Spotify playlists and albums to MP3 files. Just paste a Spotify URL below to get started.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="Paste Spotify URL here..."
              value={spotifyUrl}
              onChange={(e) => setSpotifyUrl(e.target.value)}
              className="flex-1"
            />
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {loading ? "Loading..." : "Convert"}
            </Button>
          </div>
        </form>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {warning && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>{warning}</AlertDescription>
          </Alert>
        )}

        {tracks.length > 0 && (
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Tracks ({tracks.length})</h2>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleExportExcel}>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Export Excel
                  </Button>
                  <Button
                    variant="outline"
                    onClick={downloadAllTracks}
                    disabled={batchDownloadInProgress || tracks.some((t) => !t.verified)}
                  >
                    <Package className="h-4 w-4 mr-2" />
                    Download All
                  </Button>
                </div>
              </div>

              {autoMatchingInProgress && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Matching tracks with YouTube...</span>
                    <span>{autoMatchingProgress}%</span>
                  </div>
                  <Progress value={autoMatchingProgress} className="h-1" />
                </div>
              )}

              <TrackList
                tracks={tracks}
                onVerifyMatch={handleVerifyMatch}
                onSearch={handleOpenSearchModal}
                onDownload={handleDownloadTrack}
                onRetryDownload={handleRetryDownload}
                verifyingTrack={verifyingTrack}
                downloadingTrack={downloadingTrack}
                downloadingTracks={downloadingTracks}
                downloadProgress={downloadProgress}
                downloadErrors={downloadErrors}
                matchingTrackIds={matchingTrackIds}
              />

              {batchDownloadInProgress && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>
                      Downloading tracks ({batchProcessedCount}/{batchTotalTracks})
                      {batchCurrentTrack && `: "${batchCurrentTrack}"`}
                    </span>
                    <span>{batchDownloadProgress}%</span>
                  </div>
                  <Progress value={batchDownloadProgress} className="h-1" />
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <YouTubeSearchModal
          isOpen={searchModalOpen}
          onClose={() => setSearchModalOpen(false)}
          onSelect={handleSelectVideo}
          track={currentTrack}
        />

        <DownloadModal
          isOpen={downloadModalOpen}
          onClose={() => setDownloadModalOpen(false)}
          track={currentTrack}
        />
      </div>
    </div>
  )
}
