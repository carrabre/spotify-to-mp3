import type { YouTubeVideo } from "./types"
import { findBestMatch } from "./youtube-search-service"
import ytdl from 'ytdl-core'
import { Readable } from 'stream'

// Clean up a string for better search results
function cleanupString(str: string): string {
  return str
    .replace(/$$.*?$$|\[.*?\]|feat\..*?(?=\s|$)|ft\..*?(?=\s|$)|featuring.*?(?=\s|$)/gi, "") // Remove parentheses, brackets, and featuring
    .replace(/\s+/g, " ") // Replace multiple spaces with a single space
    .trim()
}

export async function searchYouTubeVideos(
  query: string,
  artistName?: string,
  trackName?: string,
): Promise<YouTubeVideo[]> {
  try {
    if (artistName && trackName) {
      const bestMatch = await findBestMatch(trackName, artistName)
      if (bestMatch) {
        return [bestMatch]
      }
    }

    // Create a more specific search query for better matches
    let enhancedQuery = query

    // If we have artist and track name separately, create a more specific query
    if (artistName && trackName) {
      // Format: "artist name - track name official audio"
      enhancedQuery = `${artistName} - ${trackName} official audio`
    }

    const response = await fetch(`/api/youtube/search?query=${encodeURIComponent(enhancedQuery)}`)

    if (!response.ok) {
      console.warn(`YouTube API request failed with status ${response.status}`)
      return []
    }

    return await response.json()
  } catch (error) {
    console.error("Error searching YouTube videos:", error)
    return []
  }
}

/**
 * Gets an audio stream from a YouTube video ID
 * @param videoId The YouTube video ID
 * @returns A readable stream of the audio data
 */
export async function getYoutubeAudioStream(videoId: string): Promise<Readable> {
  const url = `https://www.youtube.com/watch?v=${videoId}`
  
  // Get the audio stream with highest quality
  const stream = ytdl(url, {
    quality: 'highestaudio',
    filter: 'audioonly',
  })
  
  return stream
}

/**
 * Extracts the video ID from a YouTube URL
 * @param url The YouTube URL
 * @returns The video ID or null if not found
 */
export function extractVideoId(url: string): string | null {
  const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/
  const match = url.match(regex)
  return match ? match[1] : null
}
