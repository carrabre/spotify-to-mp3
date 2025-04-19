"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search, Loader2, Check, Music } from "lucide-react"
import Image from "next/image"
import type { YouTubeVideo } from "@/lib/types"

interface YouTubeSearchModalProps {
  isOpen: boolean
  onClose: () => void
  trackName: string
  artistName: string
  onSelectVideo: (video: YouTubeVideo) => void
}

export default function YouTubeSearchModal({
  isOpen,
  onClose,
  trackName,
  artistName,
  onSelectVideo,
}: YouTubeSearchModalProps) {
  const [searchQuery, setSearchQuery] = useState(`${artistName} - ${trackName}`)
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
  }, [isOpen, isAutoSearching])

  // Function to automatically search for the best match
  const handleAutoSearch = async () => {
    setIsSearching(true)
    setError(null)

    try {
      // Create a search query that's likely to find the right music video
      const enhancedQuery = `${artistName} - ${trackName} official audio`

      // Search for videos
      const response = await fetch(`/api/youtube/search?query=${encodeURIComponent(enhancedQuery)}`)

      if (!response.ok) {
        throw new Error(`Search request failed with status ${response.status}`)
      }

      const videos: YouTubeVideo[] = await response.json()

      if (videos.length === 0) {
        setError("No videos found. Try a different search term.")
        setIsAutoSearching(false)
        setIsSearching(false)
        return
      }

      setSearchResults(videos)

      // Select the first video by default
      setSelectedVideoId(videos[0].id)

      // If we found results, stop auto-searching
      setIsAutoSearching(false)
    } catch (err) {
      console.error("Error in auto-search:", err)
      setError("Automatic search failed. Please search manually.")
      setIsAutoSearching(false)
    } finally {
      setIsSearching(false)
    }
  }

  // Function to manually search YouTube
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()

    if (!searchQuery.trim()) return

    setIsSearching(true)
    setError(null)

    try {
      const response = await fetch(`/api/youtube/search?query=${encodeURIComponent(searchQuery)}`)

      if (!response.ok) {
        throw new Error(`Search request failed with status ${response.status}`)
      }

      const videos: YouTubeVideo[] = await response.json()

      setSearchResults(videos)

      if (videos.length === 0) {
        setError("No results found. Try a different search term.")
      }
    } catch (err) {
      console.error("Error searching YouTube:", err)
      setError("Failed to search YouTube. Please try again.")
    } finally {
      setIsSearching(false)
    }
  }

  // Function to handle video selection
  const handleSelectVideo = (video: YouTubeVideo) => {
    setSelectedVideoId(video.id)
    onSelectVideo(video)
    onClose()
  }

  // Function to handle direct video ID input
  const handleDirectVideoId = (videoId: string) => {
    if (videoId.match(/^[a-zA-Z0-9_-]{11}$/)) {
      const video: YouTubeVideo = {
        id: videoId,
        title: `${trackName} - ${artistName}`,
        thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
      }

      setSelectedVideoId(videoId)
      onSelectVideo(video)
      onClose()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">Find YouTube video for: {trackName}</DialogTitle>
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
              <form onSubmit={(e) => handleSearch(e)} className="flex gap-2">
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search YouTube..."
                  className="flex-1"
                />
                <Button type="submit" disabled={isSearching}>
                  {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </form>

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
                        className={`flex items-center gap-3 p-2 rounded-md cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 ${
                          selectedVideoId === video.id ? "bg-gray-100 dark:bg-gray-800" : ""
                        }`}
                        onClick={() => handleSelectVideo(video)}
                      >
                        <div className="flex-shrink-0">
                          <Image
                            src={
                              video.thumbnail ||
                              `/placeholder.svg?height=90&width=120&query=${encodeURIComponent(video.title)}`
                            }
                            alt={video.title}
                            width={120}
                            height={90}
                            className="rounded-md"
                          />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{video.title}</p>
                          <p className="text-xs text-gray-500">youtube.com/watch?v={video.id}</p>
                        </div>
                        {selectedVideoId === video.id && <Check className="h-5 w-5 text-green-500" />}
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
      </DialogContent>
    </Dialog>
  )
}
