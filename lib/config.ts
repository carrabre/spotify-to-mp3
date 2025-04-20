/**
 * Server runtime configuration helper
 * This file provides configuration for server-side operations
 */

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

// Get configuration from next.config.js serverRuntimeConfig
export function getServerRuntimeConfig() {
  try {
    // Default configuration
    const defaultConfig = {
      concurrentRequests: 4, // Default concurrent requests
      timeoutMs: 60000, // Default timeout (60 seconds)
      maxRetries: 3, // Default retry count
    };

    // Check if we're in a Next.js environment with getConfig available
    if (process.env.NEXT_PUBLIC_VERCEL_ENV) {
      // If running on Vercel, use environment-specific settings
      return {
        ...defaultConfig,
        concurrentRequests: process.env.VERCEL_REGION?.includes('iad1') ? 8 : 4, // More capacity in US East
        timeoutMs: process.env.NEXT_PUBLIC_VERCEL_ENV === 'production' ? 60000 : 120000,
      };
    }

    return defaultConfig;
  } catch (error) {
    console.error('Error loading server runtime config:', error);
    // Return default values if config cannot be loaded
    return {
      concurrentRequests: 2,
      timeoutMs: 60000,
      maxRetries: 3,
    };
  }
}
