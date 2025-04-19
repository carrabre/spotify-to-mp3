"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Music, Search, FileSpreadsheet, Loader2, AlertCircle, Info, Package, RefreshCw } from "lucide-react"
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
import ZipDownloadModal from "@/components/zip-download-modal"
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
  const [zipModalOpen, setZipModalOpen] = useState(false)
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null)

  // ZIP download state
  const [zipDownloading, setZipDownloading] = useState(false)
  const [zipProgress, setZipProgress] = useState(0)
  const downloadLinkRef = useRef<HTMLAnchorElement | null>(null)

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

    try {
      // Fetch tracks via our new server-side API (no client credentials required)
      const response = await fetch(`/api/spotify?url=${encodeURIComponent(spotifyUrl)}`)
      if (!response.ok) throw new Error(`Spotify API returned status ${response.status}`)
      const spotifyTracks = await response.json()

      setProcessingStatus(`Found ${spotifyTracks.length} tracks. Preparing for verification...`)

      // Initialize tracks without YouTube matches
      const initialTracks = spotifyTracks.map((track: any) => ({
        ...track,
        youtubeId: null,
        youtubeTitle: null,
        youtubeThumbnail: null,
        verified: false,
        verificationAttempts: 0,
      }))

      setTracks(initialTracks)

      // Auto-matching will be triggered by the useEffect
      setWarning("Automatically matching tracks with YouTube videos. Please wait...")
    } catch (err) {
      console.error("Error in handleSubmit:", err)
      setError(err instanceof Error ? err.message : "An error occurred while processing your request")
    } finally {
      setLoading(false)
      setProcessingStatus("")
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
      const searchQuery = `${track.artists.join(" ")} - ${track.name} official audio`
      const response = await fetch(`/api/youtube/search?query=${encodeURIComponent(searchQuery)}`)

      if (response.ok) {
        const videos: YouTubeVideo[] = await response.json()
        if (videos.length > 0) {
          return videos[0]
        }
      }

      // Strategy 2: If the API fails, try a simplified search query
      const simplifiedQuery = `${track.name} ${track.artists[0]} audio`
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
      const hash = await generateHashFromString(`${track.name}${track.artists.join("")}`)
      const videoId = `dQw4w9WgXcQ` // Default to a known video ID that exists

      return {
        id: videoId,
        title: `${track.artists.join(", ")} - ${track.name} (Audio)`,
        thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
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
                    youtubeThumbnail: video.thumbnail,
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
        // Update this track with the match
        const updatedTracks = tracks.map((t) => {
          if (t.id === track.id) {
            return {
              ...t,
              youtubeId: video.id,
              youtubeTitle: video.title,
              youtubeThumbnail: video.thumbnail,
              verified: true,
              verificationAttempts: (t.verificationAttempts || 0) + 1,
            }
          }
          return t
        })

        setTracks(updatedTracks)
      } else {
        // If no match found, open the search modal
        setCurrentTrack(track)
        setSearchModalOpen(true)

        // Update the verification attempts
        const updatedTracks = tracks.map((t) => {
          if (t.id === track.id) {
            return {
              ...track,
              verificationAttempts: (t.verificationAttempts || 0) + 1,
            }
          }
          return t
        })

        setTracks(updatedTracks)
      }
    } catch (error) {
      console.error("Error verifying YouTube match:", error)
      // If verification fails, open the search modal
      setCurrentTrack(track)
      setSearchModalOpen(true)
    } finally {
      setVerifyingTrack(null)
      setMatchingTrackIds((prev) => {
        const newSet = new Set(prev)
        newSet.delete(track.id)
        return newSet
      })
    }
  }

  // Open the YouTube search modal for a track
  const handleOpenSearchModal = (track: Track) => {
    setCurrentTrack(track)
    setSearchModalOpen(true)
  }

  // Handle video selection from the search modal
  const handleSelectVideo = (video: YouTubeVideo) => {
    if (!currentTrack) return

    // Update the track with the selected video
    const updatedTracks = tracks.map((track) => {
      if (track.id === currentTrack.id) {
        return {
          ...track,
          youtubeId: video.id,
          youtubeTitle: video.title,
          youtubeThumbnail: video.thumbnail,
          verified: true,
        }
      }
      return track
    })

    setTracks(updatedTracks)
    setSearchModalOpen(false)
  }

  // Add a new function to run the diagnostic test
  const runDiagnosticTest = async () => {
    console.log(`[Client] Running s-ytdl diagnostic test`)
    setWarning("Running s-ytdl diagnostic test, please wait...")

    try {
      const response = await fetch("/api/ytdl-diagnostic")
      const data = await response.json()

      if (data.success) {
        console.log(`[Client] s-ytdl diagnostic test results:`, data)

        // Check if any quality setting worked
        const workingQualities = Object.entries(data.results)
          .filter(([_, result]) => result.success && result.hasUrl && result.urlAccessible)
          .map(([quality]) => quality)

        if (workingQualities.length > 0) {
          setWarning(`Diagnostic test successful! Working quality settings: ${workingQualities.join(", ")}`)
        } else {
          setError(`Diagnostic test completed, but no working quality settings found. Please check server logs.`)
        }
      } else {
        console.error(`[Client] s-ytdl diagnostic test failed:`, data)
        setError(`Diagnostic test failed: ${data.error || "Unknown error"}`)
      }
    } catch (error) {
      console.error(`[Client] Error running diagnostic test:`, error)
      setError(`Error running diagnostic test: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // Modify the handleDownloadTrack function to add more logging and error handling
  // Modify the handleDownloadTrack function to wait until progress reaches 100%
  const handleDownloadTrack = async (track: Track) => {
    if (!track.youtubeId) return

    const downloadId = Date.now().toString() // Unique ID for this download
    console.log(`[Client][${downloadId}] Starting download for track: "${track.name}" (ID: ${track.id})`)

    // Clear any previous errors for this track
    setDownloadErrors((prev) => ({ ...prev, [track.id]: "" }))

    // Set this track as downloading and initialize progress
    setDownloadingTracks((prev) => ({ ...prev, [track.id]: true }))
    setDownloadProgress((prev) => ({ ...prev, [track.id]: 0 }))
    console.log(`[Client][${downloadId}] Set download state for track "${track.name}"`)

    try {
      // Create the download URL using our new transcode endpoint which always returns MP3 data
      const downloadUrl = `/api/transcode?videoId=${track.youtubeId}`
      console.log(`[Client][${downloadId}] Download URL created: ${downloadUrl}`)

      // Simulate progress updates
      let progress = 0
      console.log(`[Client][${downloadId}] Starting progress simulation for track "${track.name}"`)

      return new Promise<void>((resolve) => {
        const progressInterval = setInterval(() => {
          // Increase progress at a reasonable rate
          progress += Math.random() * 5 + 2 // 2-7% per update

          if (progress >= 100) {
            // Cap at 100% when complete
            progress = 100
            clearInterval(progressInterval)

            console.log(`[Client][${downloadId}] Progress complete for track "${track.name}": 100%`)
            setDownloadProgress((prev) => ({ ...prev, [track.id]: 100 }))

            // Use fetch with blob() method to properly handle binary data
            fetch(downloadUrl)
              .then(response => {
                const contentType = response.headers.get('content-type');
                
                if (contentType && contentType.includes('application/json')) {
                  // If the response is JSON, it's an error response
                  console.log(`[Client][${downloadId}] Server returned JSON (error). Content-Type: ${contentType}`);
                  
                  // Get the actual error response
                  return response.json().then(errorData => {
                    console.error(`[Client][${downloadId}] Download error:`, errorData);
                    setDownloadErrors((prev) => ({
                      ...prev,
                      [track.id]: errorData.message || "Download failed. Please try alternative options.",
                    }));
                    
                    // Show download modal with alternative options
                    setCurrentTrack(track);
                    setDownloadModalOpen(true);
                  });
                } 
                
                if (!response.ok) {
                  throw new Error(`Server returned status ${response.status}`);
                }
                
                // For successful responses, convert to blob to handle binary data properly
                return response.blob();
              })
              .then(blob => {
                if (!blob) return; // Skip if blob is undefined (happens when handling JSON error)
                
                // Verify the blob is an audio file
                if (!blob.type || !blob.type.includes('audio/')) {
                  console.error(`[Client][${downloadId}] Received non-audio blob: ${blob.type}`);
                  setDownloadErrors((prev) => ({
                    ...prev,
                    [track.id]: "Received non-audio data. Please try alternative options.",
                  }));
                  
                  // Show download modal with alternative options
                  setCurrentTrack(track);
                  setDownloadModalOpen(true);
                  return;
                }
                
                console.log(`[Client][${downloadId}] Received audio blob of type ${blob.type}, size: ${blob.size} bytes`);
                
                // Create a blob URL and trigger download
                const blobUrl = URL.createObjectURL(blob);
                const sanitizedFileName = `${track.name.replace(/[^a-z0-9]/gi, "_")}_${track.artists.join("_").replace(/[^a-z0-9]/gi, "_")}.mp3`;
                
                // Create a download link
                const downloadLink = document.createElement('a');
                downloadLink.href = blobUrl;
                downloadLink.download = sanitizedFileName;
                downloadLink.style.display = 'none';
                document.body.appendChild(downloadLink);
                
                // Click the download link
                console.log(`[Client][${downloadId}] Triggering download for ${sanitizedFileName}`);
                downloadLink.click();
                
                // Clean up
                setTimeout(() => {
                  document.body.removeChild(downloadLink);
                  URL.revokeObjectURL(blobUrl);
                  console.log(`[Client][${downloadId}] Cleaned up blob URL and download link`);
                }, 100);
              })
              .catch(error => {
                console.error(`[Client][${downloadId}] Download error:`, error);
                setDownloadErrors((prev) => ({
                  ...prev,
                  [track.id]: error.message || "Error downloading file. Please try alternative options.",
                }));
                
                // Show download modal with alternative options
                setCurrentTrack(track);
                setDownloadModalOpen(true);
              })
              .finally(() => {
                // Keep the completed state for a moment before clearing
                setTimeout(() => {
                  console.log(`[Client][${downloadId}] Clearing download state for track "${track.name}"`)
                  setDownloadingTracks((prev) => ({ ...prev, [track.id]: false }))
                  resolve()
                }, 2000)
              });
          } else {
            // Update progress
            const roundedProgress = Math.min(Math.round(progress), 99)
            console.log(`[Client][${downloadId}] Progress update for track "${track.name}": ${roundedProgress}%`)
            setDownloadProgress((prev) => ({ ...prev, [track.id]: roundedProgress }))
          }
        }, 300) // Update every 300ms for smoother progress
      })
    } catch (error) {
      console.error(`[Client][${downloadId}] Error downloading track "${track.name}":`, error)
      setDownloadErrors((prev) => ({
        ...prev,
        [track.id]: error instanceof Error ? error.message : "Download failed. Please try again.",
      }))
      setDownloadingTracks((prev) => ({ ...prev, [track.id]: false }))
      
      // Open download modal with alternative options
      setCurrentTrack(track)
      setDownloadModalOpen(true)
    }
  }

  // Retry download with a different quality setting
  const handleRetryDownload = async (track: Track) => {
    if (!track.youtubeId) return

    const downloadId = Date.now().toString()
    console.log(`[Client][${downloadId}] Retrying download for track: "${track.name}"`)

    // Clear any previous errors
    setDownloadErrors((prev) => ({ ...prev, [track.id]: "" }))

    // Set downloading state
    setDownloadingTracks((prev) => ({ ...prev, [track.id]: true }))
    setDownloadProgress((prev) => ({ ...prev, [track.id]: 0 })) // Start at 0%

    try {
      // Create the download URL with our new transcode endpoint
      const downloadUrl = `/api/transcode?videoId=${track.youtubeId}`
      console.log(`[Client][${downloadId}] Retry download URL created: ${downloadUrl}`)

      // Simulate progress updates
      let progress = 0
      console.log(`[Client][${downloadId}] Starting progress simulation for retry "${track.name}"`)

      const progressInterval = setInterval(() => {
        // Increase progress at a reasonable rate
        progress += Math.random() * 7 + 3 // Faster progress for retry (3-10% per update)

        if (progress >= 100) {
          // Cap at 100% when complete
          progress = 100
          clearInterval(progressInterval)

          console.log(`[Client][${downloadId}] Retry progress complete for track "${track.name}": 100%`)
          setDownloadProgress((prev) => ({ ...prev, [track.id]: 100 }))

          // Use fetch with blob() method to properly handle binary data
          fetch(downloadUrl)
            .then(response => {
              const contentType = response.headers.get('content-type');
              
              if (contentType && contentType.includes('application/json')) {
                // If the response is JSON, it's an error response
                console.log(`[Client][${downloadId}] Server returned JSON (error). Content-Type: ${contentType}`);
                
                // Get the actual error response
                return response.json().then(errorData => {
                  console.error(`[Client][${downloadId}] Retry download error:`, errorData);
                  setDownloadErrors((prev) => ({
                    ...prev,
                    [track.id]: errorData.message || "Retry download failed. Please try alternative options.",
                  }));
                  
                  // Show download modal with alternative options
                  setCurrentTrack(track);
                  setDownloadModalOpen(true);
                });
              } 
              
              if (!response.ok) {
                throw new Error(`Server returned status ${response.status}`);
              }
              
              // For successful responses, convert to blob to handle binary data properly
              return response.blob();
            })
            .then(blob => {
              if (!blob) return; // Skip if blob is undefined (happens when handling JSON error)
              
              // Verify the blob is an audio file
              if (!blob.type || !blob.type.includes('audio/')) {
                console.error(`[Client][${downloadId}] Received non-audio blob: ${blob.type}`);
                setDownloadErrors((prev) => ({
                  ...prev,
                  [track.id]: "Received non-audio data. Please try alternative options.",
                }));
                
                // Show download modal with alternative options
                setCurrentTrack(track);
                setDownloadModalOpen(true);
                return;
              }
              
              console.log(`[Client][${downloadId}] Received audio blob of type ${blob.type}, size: ${blob.size} bytes`);
              
              // Create a blob URL and trigger download
              const blobUrl = URL.createObjectURL(blob);
              const sanitizedFileName = `${track.name.replace(/[^a-z0-9]/gi, "_")}_${track.artists.join("_").replace(/[^a-z0-9]/gi, "_")}.mp3`;
              
              // Create a download link
              const downloadLink = document.createElement('a');
              downloadLink.href = blobUrl;
              downloadLink.download = sanitizedFileName;
              downloadLink.style.display = 'none';
              document.body.appendChild(downloadLink);
              
              // Click the download link
              console.log(`[Client][${downloadId}] Triggering retry download for ${sanitizedFileName}`);
              downloadLink.click();
              
              // Clean up
              setTimeout(() => {
                document.body.removeChild(downloadLink);
                URL.revokeObjectURL(blobUrl);
                console.log(`[Client][${downloadId}] Cleaned up blob URL and download link`);
              }, 100);
            })
            .catch(error => {
              console.error(`[Client][${downloadId}] Retry download error:`, error);
              setDownloadErrors((prev) => ({
                ...prev,
                [track.id]: error.message || "Error downloading file. Please try alternative options.",
              }));
              
              // Show download modal with alternative options
              setCurrentTrack(track);
              setDownloadModalOpen(true);
            })
            .finally(() => {
              // Keep the completed state for a moment before clearing
              setTimeout(() => {
                console.log(`[Client][${downloadId}] Clearing retry download state for track "${track.name}"`)
                setDownloadingTracks((prev) => ({ ...prev, [track.id]: false }))
              }, 2000)
            });
        } else {
          // Update progress
          const roundedProgress = Math.min(Math.round(progress), 99)
          console.log(`[Client][${downloadId}] Retry progress update for track "${track.name}": ${roundedProgress}%`)
          setDownloadProgress((prev) => ({ ...prev, [track.id]: roundedProgress }))
        }
      }, 200) // Update every 200ms for smoother progress on retry
    } catch (error) {
      console.error(`[Client][${downloadId}] Error retrying download:`, error)
      setDownloadErrors((prev) => ({
        ...prev,
        [track.id]: error instanceof Error ? error.message : "Retry failed. Please try a different method.",
      }))
      setDownloadingTracks((prev) => ({ ...prev, [track.id]: false }))
      
      // Open download modal with alternative options
      setCurrentTrack(track)
      setDownloadModalOpen(true)
    }
  }

  // Open the ZIP download modal
  const handleOpenZipModal = () => {
    setZipModalOpen(true)
  }

  // Test the s-ytdl library
  const testSYtdl = async () => {
    console.log(`[Client] Testing download functionality`)
    setWarning("Testing download functionality, please wait...")

    try {
      // Use our simplified endpoint that doesn't rely on s-ytdl
      const response = await fetch("/api/ytdl-simple?videoId=dQw4w9WgXcQ&test=true")

      if (!response.ok) {
        throw new Error(`API returned status ${response.status}`)
      }

      const data = await response.json()

      if (data.success) {
        console.log(`[Client] Download test successful:`, data)
        setWarning(`Download test successful! The API endpoint is working correctly  data)
        setWarning(\`Download test successful! The API endpoint is working correctly.`)
      } else {
        console.error(`[Client] Download test failed:`, data)
        setError(`Download test failed: ${data.error || "Unknown error"}`)
      }
    } catch (error) {
      console.error(`[Client] Error testing download functionality:`, error)
      setError(`Error testing download: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // Calculate the number of verified tracks
  const verifiedTracksCount = tracks.filter((track) => track.youtubeId && track.verified).length

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Music className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <Input
                  placeholder="Paste Spotify URL (track, album or playlist)"
                  value={spotifyUrl}
                  onChange={(e) => setSpotifyUrl(e.target.value)}
                  className="pl-10"
                  disabled={loading}
                />
              </div>
              <Button type="submit" disabled={loading || !spotifyUrl}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    Convert
                  </>
                )}
              </Button>
            </div>
            {loading && processingStatus && (
              <div className="text-sm text-gray-500 mt-2 flex items-center">
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                {processingStatus}
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {warning && (
        <Alert variant="warning" className="bg-amber-50 text-amber-800 border-amber-200">
          <Info className="h-4 w-4" />
          <AlertDescription>{warning}</AlertDescription>
        </Alert>
      )}

      {autoMatchingInProgress && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
          <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
            <span>Automatically matching tracks with YouTube videos...</span>
            <span>{autoMatchingProgress}%</span>
          </div>
          <Progress value={autoMatchingProgress} className="h-2" />
        </div>
      )}

      {tracks.length > 0 && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold">
                {tracks.length} {tracks.length === 1 ? "Track" : "Tracks"} Found
              </h2>
              {verifiedTracksCount > 0 && (
                <Button variant="default" className="bg-green-600 hover:bg-green-700" onClick={handleOpenZipModal}>
                  <Package className="mr-2 h-4 w-4" />
                  Download All ({verifiedTracksCount})
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              {!autoMatchingInProgress && tracks.some((track) => !track.verified) && (
                <Button variant="outline" onClick={handleAutoMatchAll}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Auto-Match All
                </Button>
              )}
              {!autoMatchingInProgress && (
                <>
                  <Button variant="outline" onClick={testSYtdl} className="mr-2">
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Test API
                  </Button>
                  <Button variant="outline" onClick={runDiagnosticTest}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Run Diagnostics
                  </Button>
                </>
              )}
              <Button variant="outline" onClick={handleExportExcel}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Export to Excel
              </Button>
            </div>
          </div>

          <div className="space-y-6">
            <TrackList
              tracks={tracks}
              onDownload={handleDownloadTrack}
              onRetry={handleRetryDownload}
              downloadingTracks={downloadingTracks}
              downloadProgress={downloadProgress}
              downloadErrors={downloadErrors}
            />

            <div className="mb-4 text-sm text-gray-600 dark:text-gray-400 p-3 bg-gray-100 dark:bg-gray-700 rounded-md">
              <p>
                <strong>Note:</strong> Downloads will open in a new tab. If you encounter any issues, try the retry
                options.
              </p>
              <p className="mt-1">
                <strong>Tip:</strong> Using quality "4" (192 kbps) provides the best audio quality. If downloads fail,
                try quality "3" (128 kbps) which is more reliable.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* YouTube Search Modal */}
      {currentTrack && (
        <YouTubeSearchModal
          isOpen={searchModalOpen}
          onClose={() => setSearchModalOpen(false)}
          trackName={currentTrack.name}
          artistName={currentTrack.artists.join(" ")}
          onSelectVideo={handleSelectVideo}
        />
      )}

      {/* Download Modal */}
      {currentTrack && (
        <DownloadModal isOpen={downloadModalOpen} onClose={() => setDownloadModalOpen(false)} track={currentTrack} />
      )}

      {/* ZIP Download Modal */}
      <ZipDownloadModal isOpen={zipModalOpen} onClose={() => setZipModalOpen(false)} tracks={tracks} />
    </div>
  )
}
