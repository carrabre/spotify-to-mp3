// This file contains functions for searching YouTube directly from the client
// without relying on the YouTube API

interface YouTubeSearchResult {
  id: string
  title: string
  channelName: string
  viewCount: string
  thumbnail: string
}

// Function to search YouTube and extract video information
export async function searchYouTubeClient(query: string): Promise<YouTubeSearchResult[]> {
  try {
    // Create a search query that's likely to find the right music video
    const enhancedQuery = `${query} official audio music`

    // Construct a URL for YouTube search
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(enhancedQuery)}`

    // Fetch the search results page
    const response = await fetch(searchUrl)
    const html = await response.text()

    // Extract video IDs and titles using regex
    // This is a simplified approach and might need adjustment
    const videoPattern = /"videoId":"([^"]+)","thumbnail".+?"title":\s*{\s*"runs":\s*\[\s*{\s*"text":\s*"([^"]+)"/g
    const channelPattern = /"ownerText":\s*{\s*"runs":\s*\[\s*{\s*"text":\s*"([^"]+)"/g

    const results: YouTubeSearchResult[] = []
    let match

    // Extract video IDs and titles
    while ((match = videoPattern.exec(html)) !== null) {
      const id = match[1]
      const title = match[2].replace(/\\u0026/g, "&")

      // Only include results that look like music videos
      if (
        title.toLowerCase().includes("official") ||
        title.toLowerCase().includes("audio") ||
        title.toLowerCase().includes("music") ||
        title.toLowerCase().includes("lyrics")
      ) {
        results.push({
          id,
          title,
          channelName: "Unknown", // We'll update this later
          viewCount: "Unknown",
          thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
        })
      }

      // Limit to 5 results
      if (results.length >= 5) break
    }

    return results
  } catch (error) {
    console.error("Error searching YouTube:", error)
    return []
  }
}

// Function to verify if a YouTube video matches a track
export function verifyVideoMatch(videoTitle: string, trackName: string, artistName: string): boolean {
  // Convert everything to lowercase for case-insensitive comparison
  const videoTitleLower = videoTitle.toLowerCase()
  const trackNameLower = trackName.toLowerCase()
  const artistNameLower = artistName.toLowerCase()

  // Check if both track name and artist name appear in the video title
  const hasTrackName = videoTitleLower.includes(trackNameLower)
  const hasArtistName = videoTitleLower.includes(artistNameLower)

  // Check for common music video indicators
  const isOfficialVideo =
    videoTitleLower.includes("official") ||
    videoTitleLower.includes("audio") ||
    videoTitleLower.includes("music video") ||
    videoTitleLower.includes("lyrics")

  // Return true if the video title contains both the track name and artist name,
  // or if it contains the track name and looks like an official music video
  return (hasTrackName && hasArtistName) || (hasTrackName && isOfficialVideo)
}

// Function to find the best match for a track
export async function findBestMatch(trackName: string, artistName: string): Promise<YouTubeSearchResult | null> {
  try {
    // Search for the track with artist name
    const searchQuery = `${artistName} ${trackName}`
    const searchResults = await searchYouTubeClient(searchQuery)

    // Check each result for a match
    for (const result of searchResults) {
      if (verifyVideoMatch(result.title, trackName, artistName)) {
        return result
      }
    }

    // If no match found, try with just the track name
    if (searchResults.length > 0) {
      return searchResults[0] // Return the first result as a fallback
    }

    return null
  } catch (error) {
    console.error("Error finding best match:", error)
    return null
  }
}
