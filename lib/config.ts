// Feature flags and configuration
export const config = {
  // Set to true since we're now using youtube-search-api which doesn't require an API key
  enableYouTubeAPI: true,

  // Batch size for processing tracks
  batchSize: 10,

  // Use ytdl-mp3 for direct downloads
  useYtdlMp3: true,

  // Don't show warnings about YouTube API being disabled
  showApiWarnings: false,

  // YouTube search domain fallback
  fallbackYouTubeDomain: "y2mate.com",
}
