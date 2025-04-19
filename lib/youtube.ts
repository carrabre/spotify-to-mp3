import type { YouTubeVideo } from "./types"
import { findBestMatch } from "./youtube-search-service"

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
