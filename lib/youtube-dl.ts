import youtubeDl from 'youtube-dl-exec';

/**
 * Wrapper for youtube-dl-exec to ensure it's available for importing
 * This wrapper makes it easier to use across the application
 */

export default youtubeDl;

/**
 * Helper function to get video info using youtube-dl-exec
 */
export const getVideoInfo = async (url: string) => {
  try {
    return await youtubeDl(url, {
      dumpSingleJson: true,
      noWarnings: true,
      preferFreeFormats: true,
      youtubeSkipDashManifest: true,
    });
  } catch (error) {
    console.error('Error getting video info:', error);
    throw error;
  }
};

/**
 * Helper function to get available formats using youtube-dl-exec
 */
export const getFormats = async (url: string) => {
  try {
    const info = await youtubeDl(url, {
      dumpSingleJson: true,
      noWarnings: true,
    }) as any; // Cast to any to avoid TypeScript errors with formats property
    
    return Array.isArray(info.formats) ? info.formats : [];
  } catch (error) {
    console.error('Error getting formats:', error);
    return [];
  }
}; 