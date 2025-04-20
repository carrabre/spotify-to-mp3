import type { YouTubeVideo } from "./types"

// A service to search for YouTube videos
export async function searchYouTube(query: string, limit = 10): Promise<YouTubeVideo[]> {
  console.log(`[youtube-search-service] Searching for: "${query}", limit: ${limit}`)

  // First try the official YouTube API
  try {
    // Import the package dynamically to avoid server-side issues
    // @ts-ignore - Module lacks type definitions
    const youtubeSearchApi = await import("youtube-search-api")

    // Search for videos only (not playlists or channels)
    const response = await youtubeSearchApi.GetListByKeyword(
      query,
      false, // Don't include playlists
      limit,
      [{ type: "video" }],
    )

    if (!response || !response.items || !Array.isArray(response.items)) {
      console.error("Invalid response from youtube-search-api:", response)
      return []
    }

    // Extract the video data
    const videos = response.items
      .filter((item: any) => item.type === "video")
      .map((item: any) => {
        return {
          id: item.id,
          title: item.title,
          thumbnail: item.thumbnail.thumbnails[0].url,
        }
      })
      .slice(0, limit)

    return videos
  } catch (error) {
    console.error("Error searching YouTube videos:", error)

    // If we get a 500 error, it might be a rate limit or temporary issue
    // We'll return an empty array and let the caller handle fallbacks
    return []
  }
}

/**
 * Find the best match for a track on YouTube
 * @param trackName The name of the track
 * @param artistName The name of the artist
 * @returns The best matching YouTube video or null if no match found
 */
export async function findBestMatch(trackName: string, artistName: string): Promise<YouTubeVideo | null> {
  try {
    // Try different search queries in order of specificity
    const searchQueries = [
      `${artistName} - ${trackName} official audio`, // Most specific
      `${artistName} ${trackName} audio`, // Less specific
      `${trackName} ${artistName}`, // Even less specific
      trackName, // Least specific
    ]

    // Try each query until we find results
    for (const query of searchQueries) {
      try {
        const videos = await searchYouTube(query)

        if (videos.length > 0) {
          // Check if any of the videos match the track and artist
          for (const video of videos) {
            if (isGoodMatch(video.title, trackName, artistName)) {
              return video
            }
          }

          // If no good match found but we have results, return the first one
          return videos[0]
        }
      } catch (queryError) {
        console.error(`Error with query "${query}":`, queryError)
        // Continue to the next query
      }
    }

    return null
  } catch (error) {
    console.error("Error finding best match:", error)
    return null
  }
}

/**
 * Check if a video title is a good match for a track and artist
 * @param videoTitle The title of the YouTube video
 * @param trackName The name of the track
 * @param artistName The name of the artist
 * @returns True if the video title is a good match
 */
function isGoodMatch(videoTitle: string, trackName: string, artistName: string): boolean {
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

/**
 * Get details for a YouTube video
 * @param videoId The YouTube video ID
 * @returns The video details or null if not found
 */
export async function getVideoDetails(videoId: string): Promise<YouTubeVideo | null> {
  try {
    // Import the package dynamically to avoid server-side issues
    // @ts-ignore - Module lacks type definitions
    const youtubeSearchApi = await import("youtube-search-api")

    // Get video details
    const details = await youtubeSearchApi.GetVideoDetails(videoId)

    if (!details || !details.id) {
      return null
    }

    return {
      id: details.id,
      title: details.title,
      thumbnail:
        details.thumbnail && details.thumbnail.length > 0
          ? details.thumbnail[0].url
          : `https://i.ytimg.com/vi/${details.id}/mqdefault.jpg`,
    }
  } catch (error) {
    console.error("Error getting video details:", error)
    return null
  }
}
