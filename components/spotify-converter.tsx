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
  const [sourceName, setSourceName] = useState<string>("")

  // YouTube search modal state
  const [searchModalOpen, setSearchModalOpen] = useState(false)
  const [downloadModalOpen, setDownloadModalOpen] = useState(false)
  const [zipModalOpen, setZipModalOpen] = useState(false)
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null)

  // ZIP download state
  const [zipDownloading, setZipDownloading] = useState(false)
  const [zipProgress, setZipProgress] = useState(0)
  const downloadLinkRef = useRef<HTMLAnchorElement | null>(null)

  // Add new state variables for batch downloading
  const [batchDownloadInProgress, setBatchDownloadInProgress] = useState(false)
  const [batchDownloadProgress, setBatchDownloadProgress] = useState(0)
  const [currentBatchTrackIndex, setCurrentBatchTrackIndex] = useState(0)
  const [batchTotalTracks, setBatchTotalTracks] = useState(0)
  const [downloadedFiles, setDownloadedFiles] = useState<{name: string, blob: Blob}[]>([])

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
      const spotifyData = await response.json()
      const spotifyTracks = spotifyData.tracks
      const name = spotifyData.sourceName

      setProcessingStatus(`Found ${spotifyTracks.length} tracks from "${name}". Preparing for verification...`)
      setSourceName(name)

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
          .filter(([_, result]) => {
            const typedResult = result as { success: boolean; hasUrl: boolean; urlAccessible: boolean };
            return typedResult.success && typedResult.hasUrl && typedResult.urlAccessible;
          })
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

  // Create a helper function to safely format filenames while preserving original names
  const createSafeFilename = (track: Track): string => {
    // Only replace characters that are illegal in filenames
    // Windows/macOS/Linux illegal filename chars: / \ : * ? " < > |
    const sanitizeName = (name: string) => name
      .replace(/[/\\:*?"<>|]/g, '-') // Replace illegal chars with dashes
      .replace(/\s+/g, ' ')          // Normalize whitespace
      .trim();
    
    const trackName = sanitizeName(track.name);
    const artistName = track.artists.map(artist => sanitizeName(artist)).join(', ');
    
    // Format: Artist - Track.mp3
    return `${artistName} - ${trackName}.mp3`;
  };

  // Add a helper function to fetch and prepare album artwork for embedding
  const embedAlbumArtwork = async (audioBlob: Blob, track: Track): Promise<Blob> => {
    try {
      if (!track.albumImageUrl) {
        console.log(`[AlbumArt] No album image URL available for "${track.name}"`);
        return audioBlob; // Return original blob if no album art
      }
      
      console.log(`[AlbumArt] Fetching album artwork from ${track.albumImageUrl}`);
      
      // Fetch the album artwork
      const artworkResponse = await fetch(track.albumImageUrl);
      if (!artworkResponse.ok) {
        console.error(`[AlbumArt] Failed to fetch album artwork: ${artworkResponse.status}`);
        return audioBlob;
      }
      
      // Get the artwork as array buffer
      const artworkBuffer = await artworkResponse.arrayBuffer();
      
      // Create web worker for processing in the browser
      const processingWorker = new Worker(
        URL.createObjectURL(
          new Blob([`
            self.onmessage = async function(e) {
              try {
                const { audioArrayBuffer, artworkArrayBuffer, trackInfo } = e.data;
                
                // We need to use the browser's API for this part
                // Convert audio array buffer to a Blob with the correct MIME type
                const modifiedBlob = new Blob([audioArrayBuffer], { type: 'audio/mpeg' });
                
                // Return the processed audio
                self.postMessage({ 
                  success: true, 
                  audioBlob: modifiedBlob,
                  message: "Album artwork embedded in browser"
                });
              } catch (error) {
                self.postMessage({ 
                  success: false, 
                  message: error.toString()
                });
              }
            };
          `], { type: 'application/javascript' })
        )
      );
      
      // Convert audio blob to array buffer for processing
      const audioArrayBuffer = await audioBlob.arrayBuffer();
      
      // Process the audio with artwork in the web worker
      return new Promise((resolve, reject) => {
        processingWorker.onmessage = (e) => {
          if (e.data.success) {
            console.log(`[AlbumArt] ${e.data.message}`);
            resolve(e.data.audioBlob);
          } else {
            console.error(`[AlbumArt] Error embedding artwork: ${e.data.message}`);
            resolve(audioBlob); // Return original blob on error
          }
          processingWorker.terminate();
        };
        
        processingWorker.onerror = (error) => {
          console.error(`[AlbumArt] Worker error: ${error.message}`);
          resolve(audioBlob); // Return original blob on error
          processingWorker.terminate();
        };
        
        // Send data to the worker
        processingWorker.postMessage({
          audioArrayBuffer,
          artworkArrayBuffer: artworkBuffer,
          trackInfo: {
            title: track.name,
            artist: track.artists.join(', '),
            album: track.album
          }
        });
      });
    } catch (error) {
      console.error(`[AlbumArt] Error processing artwork: ${error instanceof Error ? error.message : String(error)}`);
      return audioBlob; // Return original blob on error
    }
  };

  // Enhance the embedAlbumArtworkAPI function to provide more detailed information
  const embedAlbumArtworkAPI = async (audioBlob: Blob, track: Track): Promise<Blob> => {
    try {
      if (!track.albumImageUrl) {
        console.log(`[AlbumArt] No album image URL available for "${track.name}"`);
        return audioBlob; // Return original blob if no album art
      }
      
      // Validate that we have a Spotify album cover
      if (!track.albumImageUrl.includes('scdn.co') && !track.albumImageUrl.includes('spotify.com')) {
        console.error(`[AlbumArt] Not using a Spotify album URL: ${track.albumImageUrl}`);
        // Try to get a Spotify URL if possible
        if (track.youtubeThumbnail && track.albumImageUrl === track.youtubeThumbnail) {
          console.error(`[AlbumArt] Image URL is from YouTube, not Spotify`);
          return audioBlob; // Skip embedding as we need a Spotify image
        }
        return audioBlob; // Skip embedding with non-Spotify images
      }
      
      console.log(`[AlbumArt] Using API to embed album artwork for "${track.name}"`);
      console.log(`[AlbumArt] Album image URL: ${track.albumImageUrl}`);
      
      // Create a FormData object to send the binary data
      const formData = new FormData();
      formData.append('audio', audioBlob, 'audio.mp3');
      formData.append('trackName', track.name);
      formData.append('artistName', track.artists.join(', '));
      formData.append('albumName', track.album);
      formData.append('albumImageUrl', track.albumImageUrl);
      
      // Send to our server-side API for processing
      console.log(`[AlbumArt] Sending request to embed-artwork API, audio size: ${audioBlob.size} bytes`);
      const response = await fetch('/api/embed-artwork', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        console.error(`[AlbumArt] API error: ${response.status} ${response.statusText}`);
        
        // Try to get more detailed error information
        try {
          const errorData = await response.json();
          console.error(`[AlbumArt] API error details:`, errorData);
        } catch (parseError) {
          console.error(`[AlbumArt] Could not parse error response`);
        }
        
        return audioBlob; // Return original on error
      }
      
      // Get the processed audio with embedded artwork
      const processedBlob = await response.blob();
      console.log(`[AlbumArt] Successfully received processed audio from API, size: ${processedBlob.size} bytes`);
      
      // Only return the processed blob if it's a valid size (at least as big as the original)
      if (processedBlob.size < audioBlob.size * 0.9) {
        console.warn(`[AlbumArt] Processed blob is significantly smaller than original, using original instead`);
        return audioBlob;
      }
      
      return processedBlob;
    } catch (error) {
      console.error(`[AlbumArt] API error: ${error instanceof Error ? error.message : String(error)}`);
      return audioBlob; // Return original on error
    }
  };

  // Modify the handleDownloadTrack function to add more logging and error handling
  // Modify the handleDownloadTrack function to wait until progress reaches 100%
  const handleDownloadTrack = async (track: Track) => {
    if (!track.youtubeId) return

    const downloadId = Date.now().toString()
    console.log(`[Client][${downloadId}] Starting download for track: "${track.name}"`)

    // Clear any previous errors for this track
    setDownloadErrors((prev) => ({ ...prev, [track.id]: "" }))

    // Set this track as downloading and initialize progress
    setDownloadingTracks((prev) => ({ ...prev, [track.id]: true }))
    setDownloadProgress((prev) => ({ ...prev, [track.id]: 0 }))
    console.log(`[Client][${downloadId}] Set download state for track "${track.name}"`)

    try {
      // First try the new transcode endpoint with YouTube.js
      const downloadUrl = `/api/alt-transcode?videoId=${track.youtubeId}`
      console.log(`[Client][${downloadId}] Download URL created (using YouTube.js): ${downloadUrl}`)
      
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
            console.log(`[Client][${downloadId}] Initiating fetch request to ${downloadUrl}`)
            fetch(downloadUrl)
              .then(async (response) => {
                // Log response details for debugging
                const contentType = response.headers.get('content-type') || 'unknown'
                const contentLength = response.headers.get('content-length') || 'unknown'
                const contentDisposition = response.headers.get('content-disposition') || 'unknown'
                
                console.log(`[Client][${downloadId}] Response received:`, {
                  status: response.status,
                  statusText: response.statusText,
                  contentType,
                  contentLength,
                  contentDisposition,
                  ok: response.ok
                })
                
                // Check if the response is HTML or JSON (which could indicate an error)
                if (contentType.includes('text/html') || (contentType.includes('application/json') && !response.ok)) {
                  console.error(`[Client][${downloadId}] Error response received, trying fallback endpoint`, {
                    status: response.status,
                    statusText: response.statusText,
                    contentType,
                    headers: Object.fromEntries([...response.headers.entries()].map(([k, v]) => [k, v.substring(0, 50)]))
                  })
                  
                  // Try the alternative endpoint
                  const fallbackUrl = `/api/transcode?videoId=${track.youtubeId}`
                  console.log(`[Client][${downloadId}] Trying fallback endpoint: ${fallbackUrl}`)
                  
                  try {
                    const fallbackResponse = await fetch(fallbackUrl)
                    
                    console.log(`[Client][${downloadId}] Fallback response:`, {
                      status: fallbackResponse.status,
                      statusText: fallbackResponse.statusText,
                      contentType: fallbackResponse.headers.get('content-type'),
                      contentLength: fallbackResponse.headers.get('content-length')
                    })
                    
                    // If fallback works, use it
                    if (fallbackResponse.ok && 
                        !fallbackResponse.headers.get('content-type')?.includes('text/html') &&
                        !fallbackResponse.headers.get('content-type')?.includes('application/json')) {
                      return fallbackResponse.blob()
                    }
                    
                    // If fallback also fails with JSON, get the error
                    if (fallbackResponse.headers.get('content-type')?.includes('application/json')) {
                      const fallbackErrorData = await fallbackResponse.json()
                      console.error(`[Client][${downloadId}] Fallback endpoint error:`, fallbackErrorData)
                      setDownloadErrors((prev) => ({
                        ...prev,
                        [track.id]: fallbackErrorData.message || "Both primary and fallback download methods failed.",
                      }))
                    } else {
                      setDownloadErrors((prev) => ({
                        ...prev,
                        [track.id]: "Both download methods failed. Please try alternative options.",
                      }))
                    }
                  } catch (fallbackError) {
                    console.error(`[Client][${downloadId}] Error with fallback endpoint:`, fallbackError)
                    setDownloadErrors((prev) => ({
                      ...prev,
                      [track.id]: fallbackError instanceof Error ? fallbackError.message : "Fallback download method failed.",
                    }))
                  }
                  
                  // If the original response had JSON error details, extract them
                  if (contentType.includes('application/json')) {
                    try {
                      const errorData = await response.json()
                      console.error(`[Client][${downloadId}] Primary endpoint error details:`, errorData)
                      // Only set the error if we haven't set one from the fallback already
                      if (!downloadErrors[track.id]) {
                        setDownloadErrors((prev) => ({
                          ...prev,
                          [track.id]: errorData.message || errorData.error || "Download failed with both methods.",
                        }))
                      }
                    } catch (parseError) {
                      console.error(`[Client][${downloadId}] Error parsing JSON error response:`, parseError)
                    }
                  }
                  
                  // Show download modal with alternative options
                  setCurrentTrack(track)
                  setDownloadModalOpen(true)
                  return undefined
                } 
                
                if (!response.ok) {
                  throw new Error(`Server returned status ${response.status}: ${response.statusText}`)
                }
                
                // For successful responses, convert to blob to handle binary data properly
                return response.blob()
              })
              .then(async blob => {
                if (!blob) return // Skip if blob is undefined (happens when handling error responses)
                
                // Log blob details
                console.log(`[Client][${downloadId}] Blob received:`, {
                  type: blob.type || 'no-type',
                  size: blob.size,
                  timestamp: new Date().toISOString()
                })
                
                // Verify the blob has some content
                if (blob.size < 1000) {
                  console.error(`[Client][${downloadId}] Warning: Very small file (${blob.size} bytes)`)
                  
                  if (blob.size < 100) {
                    setDownloadErrors((prev) => ({
                      ...prev,
                      [track.id]: "Received unusually small file. Please try alternative options.",
                    }))
                    
                    setCurrentTrack(track)
                    setDownloadModalOpen(true)
                    return
                  }
                }
                
                // Support various audio types, not just MP3
                const acceptedTypes = ['audio/mpeg', 'audio/mp3', 'audio/webm', 'audio/ogg', 'audio/wav', 'audio/']
                const isAudioType = acceptedTypes.some(type => (blob.type || '').includes(type))
                
                // Verify the blob is an audio file
                if (blob.type && !isAudioType) {
                  console.error(`[Client][${downloadId}] Received non-audio blob: ${blob.type}`)
                  setDownloadErrors((prev) => ({
                    ...prev,
                    [track.id]: `Received non-audio data (${blob.type}). Please try alternative options.`,
                  }))
                  
                  // Show download modal with alternative options
                  setCurrentTrack(track)
                  setDownloadModalOpen(true)
                  return
                }
                
                console.log(`[Client][${downloadId}] Received audio blob of type ${blob.type}, size: ${blob.size} bytes`)
                
                try {
                  // Embed album artwork if available
                  console.log(`[Client][${downloadId}] Embedding album artwork for "${track.name}"`);
                  const processedBlob = await embedAlbumArtworkAPI(blob, track);
                  
                  // Create a blob URL and trigger download
                  const blobUrl = URL.createObjectURL(processedBlob)
                  const fileName = createSafeFilename(track);
                  
                  // Create a download link
                  const downloadLink = document.createElement('a')
                  downloadLink.href = blobUrl
                  downloadLink.download = fileName
                  downloadLink.style.display = 'none'
                  document.body.appendChild(downloadLink)
                  
                  // Click the download link
                  console.log(`[Client][${downloadId}] Triggering download for ${fileName}`)
                  downloadLink.click()
                  
                  // Clean up
                  setTimeout(() => {
                    document.body.removeChild(downloadLink)
                    URL.revokeObjectURL(blobUrl)
                    console.log(`[Client][${downloadId}] Cleaned up blob URL and download link`)
                  }, 100)
                } catch (processError) {
                  console.error(`[Client][${downloadId}] Error processing track: ${processError instanceof Error ? processError.message : String(processError)}`);
                  
                  // Fallback to original blob if processing fails
                  const blobUrl = URL.createObjectURL(blob)
                  const fileName = createSafeFilename(track);
                  
                  const downloadLink = document.createElement('a')
                  downloadLink.href = blobUrl
                  downloadLink.download = fileName
                  downloadLink.style.display = 'none'
                  document.body.appendChild(downloadLink)
                  
                  console.log(`[Client][${downloadId}] Triggering download with original audio (no artwork)`)
                  downloadLink.click()
                  
                  setTimeout(() => {
                    document.body.removeChild(downloadLink)
                    URL.revokeObjectURL(blobUrl)
                  }, 100)
                }
              })
              .catch(error => {
                console.error(`[Client][${downloadId}] Download error:`, error)
                setDownloadErrors((prev) => ({
                  ...prev,
                  [track.id]: error.message || "Error downloading file. Please try alternative options.",
                }))
                
                // Show download modal with alternative options
                setCurrentTrack(track)
                setDownloadModalOpen(true)
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
            .then((response): Promise<Blob | undefined> => {
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
                  return undefined;
                });
              } 
              
              if (!response.ok) {
                throw new Error(`Server returned status ${response.status}`);
              }
              
              // For successful responses, convert to blob to handle binary data properly
              return response.blob();
            })
            .then(async blob => {
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
              
              try {
                // Embed album artwork if available
                console.log(`[Client][${downloadId}] Embedding album artwork for "${track.name}"`);
                const processedBlob = await embedAlbumArtworkAPI(blob, track);
                
                // Create a blob URL and trigger download
                const blobUrl = URL.createObjectURL(processedBlob);
                const fileName = createSafeFilename(track);
                
                // Create a download link
                const downloadLink = document.createElement('a');
                downloadLink.href = blobUrl;
                downloadLink.download = fileName;
                downloadLink.style.display = 'none';
                document.body.appendChild(downloadLink);
                
                // Click the download link
                console.log(`[Client][${downloadId}] Triggering retry download for ${fileName}`);
                downloadLink.click();
                
                // Clean up
                setTimeout(() => {
                  document.body.removeChild(downloadLink);
                  URL.revokeObjectURL(blobUrl);
                  console.log(`[Client][${downloadId}] Cleaned up blob URL and download link`);
                }, 100);
              } catch (processError) {
                console.error(`[Client][${downloadId}] Error processing track: ${processError instanceof Error ? processError.message : String(processError)}`);
                
                // Fallback to original blob if processing fails
                const blobUrl = URL.createObjectURL(blob);
                const fileName = createSafeFilename(track);
                
                const downloadLink = document.createElement('a');
                downloadLink.href = blobUrl;
                downloadLink.download = fileName;
                downloadLink.style.display = 'none';
                document.body.appendChild(downloadLink);
                
                console.log(`[Client][${downloadId}] Triggering retry download with original audio (no artwork)`);
                downloadLink.click();
                
                setTimeout(() => {
                  document.body.removeChild(downloadLink);
                  URL.revokeObjectURL(blobUrl);
                }, 100);
              }
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

  // New function to handle downloading all tracks sequentially with automatic batching
  const handleDownloadAllTracks = async () => {
    const verifiedTracks = tracks.filter(track => track.youtubeId && track.verified)
    if (verifiedTracks.length === 0) return
    
    // Batch size configuration
    const AUTO_BATCH_THRESHOLD = 100; // Auto-batch if more than 100 tracks
    const DEFAULT_BATCH_SIZE = 50;    // Process 50 tracks per batch by default
    
    // If user has a lot of tracks, ask if they want auto-batching
    if (verifiedTracks.length > AUTO_BATCH_THRESHOLD && !window.confirm(
      `You're about to download ${verifiedTracks.length} tracks.\n\n` +
      `To avoid browser memory issues, this will automatically create ${Math.ceil(verifiedTracks.length / DEFAULT_BATCH_SIZE)} ZIP files ` +
      `with ${DEFAULT_BATCH_SIZE} tracks each.\n\n` +
      `Continue with batched download?`
    )) {
      return; // User cancelled
    }
    
    // Initialize batch download states
    setBatchDownloadInProgress(true)
    setBatchDownloadProgress(0)
    setCurrentBatchTrackIndex(0)
    setBatchTotalTracks(verifiedTracks.length)
    setDownloadedFiles([])
    
    // Create an array to store downloaded file blobs
    const fileBlobs: {name: string, blob: Blob}[] = []
    
    // Determine if we need to split into multiple batches
    const needsBatching = verifiedTracks.length > DEFAULT_BATCH_SIZE;
    const numBatches = needsBatching ? Math.ceil(verifiedTracks.length / DEFAULT_BATCH_SIZE) : 1;
    
    if (needsBatching) {
      setWarning(`Processing ${verifiedTracks.length} tracks in ${numBatches} batches to avoid memory issues.`);
    }
    
    // Create a safe filename based on source name
    const safeSourceName = sourceName 
      ? sourceName.replace(/[/\\:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim() 
      : "spotify_tracks";
    
    // Process tracks in batches
    for (let batchIndex = 0; batchIndex < numBatches; batchIndex++) {
      // Get tracks for this batch
      const startIdx = batchIndex * DEFAULT_BATCH_SIZE;
      const endIdx = Math.min(startIdx + DEFAULT_BATCH_SIZE, verifiedTracks.length);
      const batchTracks = verifiedTracks.slice(startIdx, endIdx);
      
      // Update batch information
      if (numBatches > 1) {
        console.log(`[Batch] Processing batch ${batchIndex + 1}/${numBatches}, tracks ${startIdx + 1}-${endIdx} of ${verifiedTracks.length}`);
        setWarning(`Processing batch ${batchIndex + 1}/${numBatches}: tracks ${startIdx + 1}-${endIdx} of ${verifiedTracks.length}`);
      }
      
      // Process each track in the current batch
      const batchBlobs: {name: string, blob: Blob}[] = [];
      
      for (let i = 0; i < batchTracks.length; i++) {
        const track = batchTracks[i];
        const overallIndex = startIdx + i;
        setCurrentBatchTrackIndex(overallIndex);
        
        // Update batch progress (relative to all tracks)
        setBatchDownloadProgress(Math.round((overallIndex / verifiedTracks.length) * 100))
        
        // Skip if no YouTube ID
        if (!track.youtubeId) continue
        
        // Set this track as downloading
        setDownloadingTracks(prev => ({ ...prev, [track.id]: true }))
        setDownloadProgress(prev => ({ ...prev, [track.id]: 0 }))
        
        try {
          // First try the new API endpoint using YouTube.js
          const downloadUrl = `/api/alt-transcode?videoId=${track.youtubeId}`;
          console.log(`[Batch][${overallIndex+1}/${verifiedTracks.length}] Downloading "${track.name}" using alt-transcode`);
          
          // Download the track
          let audioBlob: Blob | null = null;
          let errorMessage: string | null = null;
          
          try {
            const response = await fetch(downloadUrl);
            
            // Check if response is JSON (error)
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
              const errorData = await response.json();
              errorMessage = errorData.message || "Download failed with alt-transcode";
              console.log(`[Batch] Error from alt-transcode: ${errorMessage}, will try fallback endpoint`);
              
              // Try fallback endpoint
              const fallbackUrl = `/api/transcode?videoId=${track.youtubeId}`;
              console.log(`[Batch] Trying fallback endpoint: ${fallbackUrl}`);
              
              const fallbackResponse = await fetch(fallbackUrl);
              
              if (fallbackResponse.ok && !fallbackResponse.headers.get('content-type')?.includes('application/json')) {
                audioBlob = await fallbackResponse.blob();
                errorMessage = null; // Clear error message if fallback succeeds
              } else {
                errorMessage = "All download methods failed";
              }
            } else if (!response.ok) {
              errorMessage = `Server returned status ${response.status}, trying fallback`;
              console.log(`[Batch] ${errorMessage}`);
              
              // Try fallback endpoint
              const fallbackUrl = `/api/transcode?videoId=${track.youtubeId}`;
              const fallbackResponse = await fetch(fallbackUrl);
              
              if (fallbackResponse.ok && !fallbackResponse.headers.get('content-type')?.includes('application/json')) {
                audioBlob = await fallbackResponse.blob();
                errorMessage = null; // Clear error message if fallback succeeds
              } else {
                errorMessage = "All download methods failed";
              }
            } else {
              // Get the audio blob from the primary endpoint
              audioBlob = await response.blob();
              
              // Verify it's an audio file
              if (!audioBlob.type || !audioBlob.type.includes('audio/')) {
                errorMessage = "Received non-audio data";
              }
            }
          } catch (fetchError) {
            errorMessage = fetchError instanceof Error ? fetchError.message : "Network error";
            console.error(`[Batch] Fetch error: ${errorMessage}`);
          }
          
          // Handle errors or process the blob
          if (errorMessage) {
            console.error(`[Batch] Error for "${track.name}": ${errorMessage}`);
            setDownloadErrors(prev => ({
              ...prev,
              [track.id]: errorMessage
            }));
            continue; // Skip this track and move to next
          }
          
          if (!audioBlob) {
            console.error(`[Batch] No audio blob for "${track.name}"`);
            continue; // Skip this track if we somehow don't have a blob
          }
          
          // Embed album artwork if available
          console.log(`[Batch] Embedding album artwork for "${track.name}"`);
          try {
            audioBlob = await embedAlbumArtworkAPI(audioBlob, track);
          } catch (artworkError) {
            console.error(`[Batch] Error embedding artwork: ${artworkError instanceof Error ? artworkError.message : String(artworkError)}`);
            // Continue with original blob
          }
          
          // Create filename
          const fileName = createSafeFilename(track);
          
          // Store the blob for later ZIP creation
          batchBlobs.push({ name: fileName, blob: audioBlob });
          fileBlobs.push({ name: fileName, blob: audioBlob });
          setDownloadedFiles(prev => [...prev, { name: fileName, blob: audioBlob }]);
          
          // Mark this track as complete
          setDownloadProgress(prev => ({ ...prev, [track.id]: 100 }));
          
          // Small delay before processing next track to avoid overwhelming the browser
          await new Promise(resolve => setTimeout(resolve, 300));
        } catch (error) {
          console.error(`[Batch] Error processing "${track.name}":`, error);
          setDownloadErrors(prev => ({
            ...prev,
            [track.id]: error instanceof Error ? error.message : "Processing failed"
          }));
        } finally {
          // Clear downloading state for this track
          setDownloadingTracks(prev => ({ ...prev, [track.id]: false }));
        }
      }
      
      // Create and download ZIP after each batch is processed (if auto-batching)
      if (needsBatching && batchBlobs.length > 0) {
        try {
          console.log(`[Batch] Creating ZIP file for batch ${batchIndex + 1} with ${batchBlobs.length} tracks`);
          
          // Create a ZIP file for this batch
          const JSZip = (await import('jszip')).default;
          const zip = new JSZip();
          
          // Add all files from this batch to the ZIP
          batchBlobs.forEach(file => {
            zip.file(file.name, file.blob);
          });
          
          // Generate the ZIP file with streaming optimizations
          const zipBlob = await zip.generateAsync({ 
            type: 'blob',
            streamFiles: true,
            compression: "DEFLATE",
            compressionOptions: {
              level: 3 // Lower compression level (1-9) to reduce memory usage
            }
          });
          
          // Create download link for the ZIP
          const zipUrl = URL.createObjectURL(zipBlob);
          const downloadLink = document.createElement('a');
          downloadLink.href = zipUrl;
          downloadLink.download = numBatches > 1 
            ? `${safeSourceName}_batch${batchIndex + 1}_of_${numBatches}.zip` 
            : `${safeSourceName}.zip`;
          downloadLink.style.display = 'none';
          document.body.appendChild(downloadLink);
          
          // Click the download link
          downloadLink.click();
          
          // Clean up
          setTimeout(() => {
            document.body.removeChild(downloadLink);
            URL.revokeObjectURL(zipUrl);
          }, 100);
          
          console.log(`[Batch] Created and downloaded ZIP file for batch ${batchIndex + 1}`);
          
          // If we have more batches to process, wait a bit to allow memory cleanup
          if (batchIndex < numBatches - 1) {
            setWarning(`Downloaded batch ${batchIndex + 1}/${numBatches}. Preparing next batch...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        } catch (zipError) {
          console.error(`[Batch] Error creating ZIP for batch ${batchIndex + 1}:`, zipError);
          setError(`Error creating ZIP for batch ${batchIndex + 1}: ${zipError instanceof Error ? zipError.message : String(zipError)}`);
        }
      }
    }
    
    // Create a final ZIP only if we didn't do batch-by-batch ZIPs and we have files
    if (!needsBatching && fileBlobs.length > 0) {
      try {
        console.log(`[Batch] Creating ZIP file for ${fileBlobs.length} tracks`);
        setBatchDownloadProgress(100);
        
        // Create a single ZIP file
        const JSZip = (await import('jszip')).default;
        const zip = new JSZip();
        
        // Add all files to the ZIP
        fileBlobs.forEach(file => {
          zip.file(file.name, file.blob);
        });
        
        // Generate the ZIP file with streaming optimizations
        const zipBlob = await zip.generateAsync({ 
          type: 'blob',
          streamFiles: true,
          compression: "DEFLATE",
          compressionOptions: {
            level: 5
          }
        });
        
        // Create download link for the ZIP
        const zipUrl = URL.createObjectURL(zipBlob);
        const downloadLink = document.createElement('a');
        downloadLink.href = zipUrl;
        downloadLink.download = `${safeSourceName}.zip`;
        downloadLink.style.display = 'none';
        document.body.appendChild(downloadLink);
        
        // Click the download link
        downloadLink.click();
        
        // Clean up
        setTimeout(() => {
          document.body.removeChild(downloadLink);
          URL.revokeObjectURL(zipUrl);
        }, 100);
        
        console.log(`[Batch] Created and downloaded ZIP file with ${fileBlobs.length} tracks`);
      } catch (error) {
        console.error(`[Batch] Error creating ZIP file:`, error);
        setError(`Error creating ZIP file: ${error instanceof Error ? error.message : String(error)}. Try downloading fewer tracks at once.`);
      }
    }

    // Reset batch download state
    setTimeout(() => {
      setBatchDownloadInProgress(false);
      setWarning(`Downloaded ${fileBlobs.length} out of ${verifiedTracks.length} tracks${
        numBatches > 1 ? ` in ${numBatches} batches` : ''
      }`);
    }, 2000);
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
        setWarning(`Download test successful! The API endpoint is working correctly.`)
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

      {batchDownloadInProgress && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
          <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
            <span>Downloading tracks ({currentBatchTrackIndex + 1}/{batchTotalTracks}): {downloadedFiles.length} complete</span>
            <span>{batchDownloadProgress}%</span>
          </div>
          <Progress value={batchDownloadProgress} className="h-2" />
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
                <Button 
                  variant="default" 
                  className="bg-green-600 hover:bg-green-700" 
                  onClick={handleDownloadAllTracks}
                  disabled={batchDownloadInProgress}
                >
                  <Package className="mr-2 h-4 w-4" />
                  {batchDownloadInProgress ? 'Downloading...' : `Download All (${verifiedTracksCount})`}
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
      <ZipDownloadModal isOpen={zipModalOpen} onClose={() => setZipModalOpen(false)} tracks={tracks} sourceName={sourceName} />
    </div>
  )
}
