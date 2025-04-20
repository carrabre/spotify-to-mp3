"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search, Loader2, Check, Music } from "lucide-react"
import Image from "next/image"
import type { Track, YouTubeVideo } from "@/lib/types"

export interface YouTubeSearchModalProps {
  isOpen: boolean
  onClose: () => void
  track: Track | null
  onSelect: (video: YouTubeVideo) => void
}

export default function YouTubeSearchModal({
  isOpen,
  onClose,
  track,
  onSelect,
}: YouTubeSearchModalProps) {
  const [searchQuery, setSearchQuery] = useState(`${track?.artist} - ${track?.name}`)
  const [isSearching, setIsSearching] = useState(false)
  const [isAutoSearching, setIsAutoSearching] = useState(true)
  const [searchResults, setSearchResults] = useState<YouTubeVideo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null)

  // Auto-search when the modal opens
  useEffect(() => {
    if (isOpen && isAutoSearching) {
      handleAutoSearch()
    }
  }, [isOpen])

  // Function to automatically search for the best match
  const handleAutoSearch = async () => {
    setIsSearching(true)
    setError(null)

    try {
      // Create a search query that's likely to find the right music video
      const enhancedQuery = `${track?.artist} - ${track?.name} official audio`

      // Search for videos
      const response = await fetch(`/api/youtube/search?q=${encodeURIComponent(enhancedQuery)}`)
      const data = await response.json()

      if (data.videos) {
        setSearchResults(data.videos)
      }
    } catch (error) {
      console.error("Error searching YouTube:", error)
      setError("Automatic search failed. Please search manually.")
    } finally {
      setIsSearching(false)
    }
  }

  // Function to manually search YouTube
  const handleSearch = async () => {
    setIsSearching(true)

    try {
      const response = await fetch(`/api/youtube/search?q=${encodeURIComponent(searchQuery)}`)
      const data = await response.json()

      if (data.videos) {
        setSearchResults(data.videos)
      }
    } catch (error) {
      console.error("Error searching YouTube:", error)
      setError("Failed to search YouTube. Please try again.")
    } finally {
      setIsSearching(false)
    }
  }

  // Function to handle video selection
  const handleSelectVideo = (video: YouTubeVideo) => {
    setSelectedVideoId(video.id)
    onSelect(video)
    onClose()
  }

  // Function to handle direct video ID input
  const handleDirectVideoId = (videoId: string) => {
    if (videoId.match(/^[a-zA-Z0-9_-]{11}$/)) {
      const video: YouTubeVideo = {
        id: videoId,
        title: `${track?.name} - ${track?.artist}`,
        thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
        channelTitle: "Generated Match",
        duration: "0:00"
      }

      setSelectedVideoId(videoId)
      onSelect(video)
      onClose()
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch()
    }
  }

  const handleSkip = () => {
    if (track) {
      // Generate a deterministic video ID based on track info
      const trackInfo = `${track.name}-${track.artist}`
      let hash = 0
      for (let i = 0; i < trackInfo.length; i++) {
        const char = trackInfo.charCodeAt(i)
        hash = ((hash << 5) - hash) + char
        hash = hash & hash // Convert to 32-bit integer
      }
      
      // Convert hash to a YouTube-like ID (11 characters)
      const videoId = Math.abs(hash).toString(36).substring(0, 11)

      const video: YouTubeVideo = {
        id: videoId,
        title: `${track.name} - ${track.artist}`,
        thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
        channelTitle: "Generated Match",
        duration: "0:00"
      }

      setSelectedVideoId(videoId)
      onSelect(video)
      onClose()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">Find YouTube video for: {track?.name}</DialogTitle>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          {isAutoSearching ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-green-500 mb-4" />
              <p className="text-center">Searching for the best match...</p>
              <p className="text-sm text-gray-500 mt-2">This may take a moment</p>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Search YouTube..."
                  className="flex-1"
                />
                <Button onClick={handleSearch} disabled={isSearching}>
                  {isSearching ? <Loader2 className="animate-spin" /> : <Search />}
                </Button>
              </div>

              {error && <p className="text-red-500 text-sm">{error}</p>}

              <div className="space-y-2">
                <p className="text-sm text-gray-500">
                  Search for the exact song you want or paste a YouTube video URL or ID
                </p>

                <div className="flex gap-2">
                  <Input
                    placeholder="Paste YouTube URL or video ID"
                    onChange={(e) => {
                      const value = e.target.value
                      // Extract video ID from URL if needed
                      let videoId = value

                      if (value.includes("youtube.com/watch?v=")) {
                        const url = new URL(value)
                        videoId = url.searchParams.get("v") || ""
                      } else if (value.includes("youtu.be/")) {
                        videoId = value.split("youtu.be/")[1]?.split("?")[0] || ""
                      }

                      // If it looks like a valid video ID
                      if (videoId.match(/^[a-zA-Z0-9_-]{11}$/)) {
                        setSelectedVideoId(videoId)
                      }
                    }}
                  />
                  <Button
                    onClick={() => {
                      if (selectedVideoId) {
                        handleDirectVideoId(selectedVideoId)
                      }
                    }}
                    disabled={!selectedVideoId}
                  >
                    Use This ID
                  </Button>
                </div>
              </div>

              <div className="space-y-4 mt-4">
                <h3 className="font-medium">Search Results</h3>

                {searchResults.length === 0 ? (
                  <div className="text-center py-8 bg-gray-50 dark:bg-gray-800 rounded-md">
                    <Music className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-sm text-gray-500">
                      {isSearching ? "Searching..." : "No results found. Try a different search term."}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {searchResults.map((video) => (
                      <div
                        key={video.id}
                        className={`flex gap-4 p-2 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 ${
                          selectedVideoId === video.id ? "bg-gray-100 dark:bg-gray-800" : ""
                        }`}
                        onClick={() => handleSelectVideo(video)}
                      >
                        <div className="relative w-32 h-24 flex-shrink-0">
                          {video.thumbnailUrl ? (
                            <Image
                              src={video.thumbnailUrl}
                              alt={video.title}
                              fill
                              className="object-cover rounded"
                            />
                          ) : (
                            <div className="w-full h-full bg-gray-200 dark:bg-gray-700 rounded flex items-center justify-center">
                              <Music className="w-8 h-8 text-gray-400" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium line-clamp-2">{video.title}</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            {video.channelTitle}
                          </p>
                          {video.duration && (
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                              Duration: {video.duration}
                            </p>
                          )}
                        </div>
                        {selectedVideoId === video.id && (
                          <div className="flex items-center">
                            <Check className="w-5 h-5 text-green-500" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (selectedVideoId) {
                      const selectedVideo = searchResults.find((v) => v.id === selectedVideoId)
                      if (selectedVideo) {
                        handleSelectVideo(selectedVideo)
                      }
                    }
                  }}
                  disabled={!selectedVideoId}
                >
                  Select Video
                </Button>
              </div>
            </>
          )}
        </div>

        {searchResults.length === 0 && !isSearching && !isAutoSearching && (
          <div className="text-center py-8">
            <p className="text-gray-500 dark:text-gray-400 mb-4">No results found</p>
            <Button onClick={handleSkip} variant="outline">
              Skip YouTube match
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
