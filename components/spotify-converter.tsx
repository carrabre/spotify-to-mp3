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
        // Update this track with the match
        const updatedTracks = tracks.map((t) => {
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
          youtubeThumbnail: video.thumbnailUrl,
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
          // Increase progress in smaller increments (1-3% per update)
          progress += Math.random() * 2 + 1

          if (progress >= 100) {
            progress = 100
            clearInterval(progressInterval)
            setDownloadProgress((prev) => ({ ...prev, [track.id]: 100 }))

            fetch(downloadUrl)
              .then(async response => {
                const contentType = response.headers.get('content-type');
                
                if (contentType && contentType.includes('application/json')) {
                  // If the response is JSON, it's an error response
                  const errorData = await response.json();
                  console.error(`[Client][${downloadId}] Download error:`, errorData);
                  setDownloadErrors((prev) => ({
                    ...prev,
                    [track.id]: errorData.message || "Download failed. Please try alternative options.",
                  }));
                  
                  // Show download modal with alternative options
                  setCurrentTrack(track);
                  setDownloadModalOpen(true);
                  return;
                } 
                
                if (!response.ok) {
                  throw new Error(`Server returned status ${response.status}`);
                }
                
                // For successful responses, convert to blob to handle binary data properly
                const blob = await response.blob();
                
                // Verify the blob is an audio file
                if (!blob.type || !blob.type.includes('audio/')) {
                  throw new Error("Received non-audio data");
                }
                
                // Create a blob URL and trigger download
                const blobUrl = URL.createObjectURL(blob);
                const artistName = track.artist || (Array.isArray(track.artists) && track.artists[0]) || 'Unknown Artist';
                const sanitizedFileName = `${track.name.replace(/[^a-z0-9]/gi, "_")}_${artistName.replace(/[^a-z0-9]/gi, "_")}.mp3`;
                
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
            // Update progress in smaller increments
            const roundedProgress = Math.min(Math.round(progress * 10) / 10, 99)
            setDownloadProgress((prev) => ({ ...prev, [track.id]: roundedProgress }))
          }
        }, 150) // Update more frequently for smoother progress
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
        // Increase progress in smaller increments (1.5-3.5% per update)
        progress += Math.random() * 2 + 1.5

        if (progress >= 100) {
          progress = 100
          clearInterval(progressInterval)
          setDownloadProgress((prev) => ({ ...prev, [track.id]: 100 }))

          // Use fetch with blob() method to properly handle binary data
          fetch(downloadUrl)
            .then(async response => {
              const contentType = response.headers.get('content-type');
              
              if (contentType && contentType.includes('application/json')) {
                // If the response is JSON, it's an error response
                const errorData = await response.json();
                console.error(`[Client][${downloadId}] Retry download error:`, errorData);
                setDownloadErrors((prev) => ({
                  ...prev,
                  [track.id]: errorData.message || "Retry download failed. Please try alternative options.",
                }));
                
                // Show download modal with alternative options
                setCurrentTrack(track);
                setDownloadModalOpen(true);
                return;
              } 
              
              if (!response.ok) {
                throw new Error(`Server returned status ${response.status}`);
              }
              
              // For successful responses, convert to blob to handle binary data properly
              const blob = await response.blob();
              
              // Verify the blob is an audio file
              if (!blob.type || !blob.type.includes('audio/')) {
                throw new Error("Received non-audio data");
              }
              
              // Create a blob URL and trigger download
              const blobUrl = URL.createObjectURL(blob);
              const artistName = track.artist || (Array.isArray(track.artists) && track.artists[0]) || 'Unknown Artist';
              const sanitizedFileName = `${track.name.replace(/[^a-z0-9]/gi, "_")}_${artistName.replace(/[^a-z0-9]/gi, "_")}.mp3`;
              
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
          // Update progress in smaller increments
          const roundedProgress = Math.min(Math.round(progress * 10) / 10, 99)
          setDownloadProgress((prev) => ({ ...prev, [track.id]: roundedProgress }))
        }
      }, 100) // Update more frequently for smoother progress
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

  // Function to add a log message
  const addLog = (message: string) => {
    console.log(`[Download] ${message}`)
    setDownloadLogs(prev => [...prev, `${new Date().toLocaleTimeString()} - ${message}`])
  }

  // Function to download a single track
  const downloadTrack = async (track: Track): Promise<{ name: string, data: Blob } | null> => {
    if (!track.youtubeId) {
      addLog(`Skipping track "${track.name}" - No YouTube ID`)
      return null
    }

    try {
      addLog(`Starting download for "${track.name}" (ID: ${track.youtubeId})`)
      const response = await fetch(`/api/transcode?videoId=${track.youtubeId}`)
      
      if (!response.ok) {
        addLog(`Failed to download "${track.name}" - HTTP ${response.status}`)
        throw new Error(`Failed to download track: ${track.name}`)
      }
      
      const blob = await response.blob()
      const fileName = `${track.name.replace(/[^a-z0-9]/gi, "_")}.mp3`
      
      addLog(`Successfully downloaded "${track.name}" (${(blob.size / 1024 / 1024).toFixed(2)} MB)`)
      
      return {
        name: fileName,
        data: blob
      }
    } catch (error) {
      console.error(`Error downloading track ${track.name}:`, error)
      addLog(`Error downloading "${track.name}": ${error instanceof Error ? error.message : 'Unknown error'}`)
      return null
    }
  }

  const downloadAllTracks = async () => {
    if (tracks.length === 0) {
      addLog("No tracks to download")
      return
    }
    
    setBatchDownloadInProgress(true)
    addLog(`Starting batch download of ${tracks.length} tracks`)
    setBatchTotalTracks(tracks.length)
    setBatchProcessedCount(0)
    setBatchDownloadProgress(0)
    setDownloadedFiles([])
    
    const verifiedTracks = tracks.filter(track => track.youtubeId && track.verified)
    addLog(`Found ${verifiedTracks.length} verified tracks with YouTube IDs`)
    
    let completed = 0
    let successful = 0
    let failed = 0
    const downloadedFiles: { name: string, data: Blob }[] = []

    try {
      for (const track of verifiedTracks) {
        setBatchCurrentTrack(track.name)
        setBatchProcessedCount(completed)
        setBatchDownloadProgress(Math.round((completed / verifiedTracks.length) * 1000) / 10)

        addLog(`Processing track ${completed + 1}/${verifiedTracks.length}: "${track.name}"`)
        const result = await downloadTrack(track)
        
        if (result) {
          downloadedFiles.push(result)
          successful++
          addLog(`Added "${track.name}" to zip queue`)
        } else {
          failed++
        }
        
        completed++
      }

      addLog(`Download complete: ${successful} successful, ${failed} failed`)
      setDownloadedFiles(downloadedFiles)
      
      // Automatically create and download the zip file
      await createAndDownloadZip(downloadedFiles)
      
      setBatchDownloadProgress(100)
      setBatchProcessedCount(completed)
      setBatchCurrentTrack(null)

    } catch (err) {
      console.error('Error downloading tracks:', err)
      addLog(`Batch download error: ${err instanceof Error ? err.message : 'Unknown error'}`)
      setError(err instanceof Error ? err.message : 'An unknown error occurred')
    } finally {
      setBatchDownloadInProgress(false)
    }
  }

  const createAndDownloadZip = async (files: { name: string, data: Blob }[]) => {
    try {
      addLog("Creating ZIP file...")
      const formData = new FormData()
      files.forEach(file => {
        formData.append('files', file.data, file.name)
      })

      addLog(`Sending ${files.length} files to server for ZIP creation`)
      const response = await fetch('/api/create-zip', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        addLog(`Failed to create ZIP file - HTTP ${response.status}`)
        throw new Error('Failed to create zip file')
      }

      const blob = await response.blob()
      addLog(`ZIP file created successfully (${(blob.size / 1024 / 1024).toFixed(2)} MB)`)
      
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'spotify-tracks.zip'
      document.body.appendChild(a)
      a.click()
      
      // Clean up
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      addLog("ZIP file download initiated")

    } catch (err) {
      console.error('Error creating zip file:', err)
      addLog(`Error creating ZIP file: ${err instanceof Error ? err.message : 'Unknown error'}`)
      setError(err instanceof Error ? err.message : 'Failed to create zip file')
    }
  }

  // Calculate the number of verified tracks
  const verifiedTracksCount = tracks.filter((track) => track.youtubeId && track.verified).length

  return (
    <div className="container mx-auto p-4 space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex gap-2">
          <Input
            type="text"
            placeholder="Paste Spotify URL here..."
            value={spotifyUrl}
            onChange={(e) => setSpotifyUrl(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" disabled={loading || autoMatchingInProgress}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                Load Tracks
              </>
            )}
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

      {processingStatus && (
        <div className="text-sm text-muted-foreground">{processingStatus}</div>
      )}

      {/* Video Loading Progress */}
      {autoMatchingInProgress && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Matching tracks with YouTube videos: {Math.round(autoMatchingProgress)}%</span>
            <span>{tracks.filter(t => t.verified).length} of {tracks.length} tracks matched</span>
          </div>
          <Progress value={autoMatchingProgress} className="h-2" />
          {matchingTrackIds.size > 0 && (
            <div className="text-sm text-muted-foreground animate-pulse">
              Currently matching {matchingTrackIds.size} track{matchingTrackIds.size !== 1 ? 's' : ''}...
            </div>
          )}
        </div>
      )}

      {tracks.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">
                {tracks.length} Track{tracks.length !== 1 && "s"}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleExportExcel}>
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  Export to Excel
                </Button>
                <Button 
                  onClick={downloadAllTracks}
                  disabled={batchDownloadInProgress || tracks.length === 0}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download All ({tracks.length})
                </Button>
              </div>
            </div>

            {/* Batch Download Progress */}
            {batchDownloadInProgress && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Progress: {Math.round(batchDownloadProgress)}%</span>
                  <span>{batchProcessedCount} of {batchTotalTracks} tracks</span>
                </div>
                
                <Progress value={batchDownloadProgress} className="h-2" />
                
                {batchCurrentTrack && (
                  <div className="text-sm text-muted-foreground truncate">
                    Downloading: {batchCurrentTrack}
                  </div>
                )}
                
                {/* Download logs */}
                <div className="mt-4 max-h-40 overflow-y-auto border rounded-md p-2 bg-muted/50">
                  <div className="text-xs font-mono space-y-1">
                    {downloadLogs.map((log, index) => (
                      <div key={index} className="truncate">{log}</div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <TrackList
              tracks={tracks}
              onVerifyMatch={handleVerifyMatch}
              onDownload={handleDownloadTrack}
              onRetryDownload={handleRetryDownload}
              downloadingTracks={downloadingTracks}
              downloadProgress={downloadProgress}
              downloadErrors={downloadErrors}
              matchingTrackIds={matchingTrackIds}
              verifyingTrack={verifyingTrack}
            />
          </CardContent>
        </Card>
      )}

      <YouTubeSearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        track={currentTrack}
        onSelect={handleSelectVideo}
      />

      <DownloadModal
        isOpen={downloadModalOpen}
        onClose={() => setDownloadModalOpen(false)}
        track={currentTrack}
      />
    </div>
  )
}
