import type { Track } from "./types";

/**
 * Fetches and parses Apple Music playlist data
 * @param url Apple Music playlist URL
 * @returns Object containing tracks and playlist name
 */
export async function fetchAppleMusicData(url: string): Promise<{ tracks: Track[], sourceName: string }> {
  try {
    console.log(`[AppleMusic] 🚨 DIRECT FUNCTION CALL: Starting Apple Music processing for URL: ${url}`);
    console.log(`[AppleMusic] 🚨 DEBUGGING: Direct function call executing, timestamp: ${new Date().toISOString()}`);
    
    console.log(`[AppleMusic] Fetching data from Apple Music URL: ${url}`);
    // Call our API endpoint that handles Puppeteer scraping
    const response = await fetch(`/api/apple-music?url=${encodeURIComponent(url)}`);
    
    if (!response.ok) {
      console.error(`[AppleMusic] Failed to fetch data: ${response.status}`);
      throw new Error(`Failed to fetch Apple Music data: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Check if we got a valid response with tracks
    if (!data.tracks || data.tracks.length === 0) {
      console.error(`[AppleMusic] No tracks found in response: ${JSON.stringify(data.error || "Unknown error")}`);
      throw new Error(data.error || "No tracks found in the Apple Music playlist");
    }
    
    console.log(`[AppleMusic] Successfully retrieved ${data.tracks.length} tracks from "${data.sourceName}"`);
    
    // DEBUG: Log track info to verify we have the right data
    console.log(`[AppleMusic] 🚨 First 2 tracks sample:`);
    const sampleTracks = data.tracks.slice(0, 2);
    sampleTracks.forEach((track: any, i: number) => {
      console.log(`[AppleMusic] 🚨 Sample Track ${i+1}: "${track.name}" by ${track.artists.join(', ')}`);
      console.log(`[AppleMusic] 🚨 Sample Track ${i+1} artwork: ${track.albumImageUrl || 'none'}`);
    });
    
    // Tracks from Apple Music
    const originalTracks = data.tracks;
    
    console.log(`[AppleMusic] 🚨 STARTING SPOTIFY ARTWORK ENHANCEMENT for ${originalTracks.length} tracks`);
    console.log(`[AppleMusic] Enhancing tracks with Spotify album artwork...`);
    
    // Process all tracks but limit concurrent requests
    const enhancedTracks: Track[] = [];
    const batchSize = 5; // Process 5 tracks at a time to avoid overwhelming the system
    
    for (let i = 0; i < originalTracks.length; i += batchSize) {
      const batch = originalTracks.slice(i, i + batchSize);
      console.log(`[AppleMusic] Processing batch ${i/batchSize + 1}/${Math.ceil(originalTracks.length/batchSize)}, tracks ${i+1}-${Math.min(i+batchSize, originalTracks.length)}`);
      
      const batchResults = await Promise.all(
        batch.map(async (track: any, index: number) => {
          const trackIndex = i + index;
          console.log(`[AppleMusic][${trackIndex+1}/${originalTracks.length}] START: "${track.name}" by ${track.artists.join(", ")}`);
          
          // Log the original artwork URL source
          const originalArtworkSource = track.albumImageUrl 
            ? track.albumImageUrl.includes('apple') || track.albumImageUrl.includes('mzstatic')
              ? 'Apple Music'
              : 'Unknown source'
            : 'None';
          
          console.log(`[AppleMusic][${trackIndex+1}/${originalTracks.length}] Original artwork source: ${originalArtworkSource}`);
          console.log(`[AppleMusic][${trackIndex+1}/${originalTracks.length}] Original artwork URL: ${track.albumImageUrl || "none"}`);
          
          try {
            // Create search query for Spotify
            const searchQuery = `${track.artists.join(" ")} ${track.name}`;
            const encodedQuery = encodeURIComponent(searchQuery);
            console.log(`[AppleMusic][${trackIndex+1}/${originalTracks.length}] Searching Spotify for artwork: "${searchQuery}"`);
            
            // Call Spotify artwork API directly
            console.log(`[AppleMusic][${trackIndex+1}/${originalTracks.length}] Calling API: /api/spotify-artwork?q=${encodedQuery}`);
            
            const artworkResponse = await fetch(`/api/spotify-artwork?q=${encodedQuery}`);
            
            let spotifyImageUrl = null;
            
            if (artworkResponse.ok) {
              const artworkData = await artworkResponse.json();
              console.log(`[AppleMusic][${trackIndex+1}/${originalTracks.length}] API Response:`, artworkData);
              
              if (artworkData.imageUrl) {
                spotifyImageUrl = artworkData.imageUrl;
                console.log(`[AppleMusic][${trackIndex+1}/${originalTracks.length}] ✅ Found Spotify artwork: ${spotifyImageUrl}`);
              } else {
                console.log(`[AppleMusic][${trackIndex+1}/${originalTracks.length}] ❌ API returned success but no image URL`);
              }
            } else {
              console.log(`[AppleMusic][${trackIndex+1}/${originalTracks.length}] ❌ API returned error ${artworkResponse.status}`);
            }
            
            // For reporting purposes, keep track of artwork source
            const finalArtworkSource = spotifyImageUrl 
              ? "Spotify" 
              : track.albumImageUrl
                ? originalArtworkSource
                : "None";
            
            console.log(`[AppleMusic][${trackIndex+1}/${originalTracks.length}] Final artwork source: ${finalArtworkSource}`);
            
            return {
              id: track.id || `apple-${Math.random().toString(36).substring(2, 15)}`,
              name: track.name,
              artists: track.artists,
              album: track.album,
              // Use Spotify album art if available, otherwise use Apple Music art
              albumImageUrl: spotifyImageUrl || track.albumImageUrl,
              duration: typeof track.duration === 'number' ? track.duration : 0,
              spotifyUrl: "", // Not applicable for Apple Music
              youtubeId: null,
              youtubeTitle: null,
              youtubeThumbnail: null,
              verified: false,
              verificationAttempts: 0
            };
          } catch (error) {
            console.error(`[AppleMusic][${trackIndex+1}/${originalTracks.length}] ERROR IN ARTWORK PROCESSING:`, error);
            // Return track without Spotify artwork if there's an error
            return {
              id: track.id || `apple-${Math.random().toString(36).substring(2, 15)}`,
              name: track.name,
              artists: track.artists,
              album: track.album,
              albumImageUrl: track.albumImageUrl,
              duration: typeof track.duration === 'number' ? track.duration : 0,
              spotifyUrl: "",
              youtubeId: null,
              youtubeTitle: null,
              youtubeThumbnail: null,
              verified: false,
              verificationAttempts: 0
            };
          }
        })
      );
      
      // Add the batch results to the enhanced tracks
      enhancedTracks.push(...batchResults);
    }
    
    // Count how many tracks were enhanced with Spotify artwork
    const spotifyArtworkCount = enhancedTracks.filter(t => t.albumImageUrl && t.albumImageUrl.includes('scdn.co')).length;
    console.log(`[AppleMusic] Enhanced ${spotifyArtworkCount}/${enhancedTracks.length} tracks with Spotify artwork`);
    
    return {
      tracks: enhancedTracks,
      sourceName: data.sourceName || "Apple Music Playlist"
    };
    
  } catch (error) {
    console.error("[AppleMusic] TOP-LEVEL ERROR:", error);
    throw new Error(error instanceof Error ? error.message : "Failed to fetch Apple Music playlist data");
  }
}

/**
 * Searches Spotify for album artwork matching a track
 * @param trackName Name of the track
 * @param artistName Artist name
 * @param albumName Album name
 * @returns URL of the album artwork from Spotify or null if not found
 */
async function getSpotifyArtwork(trackName: string, artistName: string, albumName: string): Promise<string | null> {
  try {
    console.log(`[SpotifyArtwork] 🚨 FUNCTION CALLED with track: "${trackName}", artist: "${artistName}", album: "${albumName}"`);
    
    // Create search queries with different combinations for better matching
    const searchQueries = [];
    
    // Primary search: full search query with all information
    if (albumName && albumName.trim() !== "") {
      searchQueries.push(`${trackName} ${artistName} ${albumName}`);
    } else {
      searchQueries.push(`${trackName} ${artistName}`);
    }
    
    // Secondary searches if primary fails
    if (albumName && albumName.trim() !== "") {
      searchQueries.push(`${albumName} ${artistName}`); // Album + artist
    }
    searchQueries.push(`${trackName} ${artistName} album`); // Track + artist + "album"
    
    console.log(`[SpotifyArtwork] 🚨 Search queries: ${JSON.stringify(searchQueries)}`);
    
    // Try each search query until we find artwork
    for (let i = 0; i < searchQueries.length; i++) {
      const searchQuery = searchQueries[i];
      const isBackupQuery = i > 0;
      
      console.log(`[SpotifyArtwork] ${isBackupQuery ? '🔄 Backup search' : '🔍 Primary search'} query: "${searchQuery}"`);
      
      // Use our API to search Spotify
      const startTime = Date.now();
      console.log(`[SpotifyArtwork] 🚨 BEFORE API CALL at ${new Date().toISOString()}`);
      console.log(`[SpotifyArtwork] Calling Spotify artwork API at ${new Date().toISOString()}`);
      console.log(`[SpotifyArtwork] 🚨 Calling API: /api/spotify-artwork?q=${encodeURIComponent(searchQuery)}`);
      
      try {
        const apiUrl = `/api/spotify-artwork?q=${encodeURIComponent(searchQuery)}`;
        console.log(`[SpotifyArtwork] 🚨 Full API URL: ${apiUrl}`);
        
        const response = await fetch(apiUrl);
        const duration = Date.now() - startTime;
        
        console.log(`[SpotifyArtwork] 🚨 API RESPONDED with status: ${response.status} in ${duration}ms`);
        
        if (!response.ok) {
          console.log(`[SpotifyArtwork] API returned error ${response.status} after ${duration}ms for query: "${searchQuery}"`);
          
          // Try to get the error message from the response
          try {
            const errorData = await response.json();
            console.log(`[SpotifyArtwork] Error details: ${JSON.stringify(errorData)}`);
          } catch (e) {
            console.log(`[SpotifyArtwork] Could not parse error response`);
          }
          
          // If this is the primary query, continue to backup queries
          if (!isBackupQuery) continue;
          
          return null;
        }
        
        console.log(`[SpotifyArtwork] 🚨 Parsing API response JSON`);
        const result = await response.json();
        console.log(`[SpotifyArtwork] 🚨 RESPONSE DATA: ${JSON.stringify(result)}`);
        
        if (result.imageUrl) {
          console.log(`[SpotifyArtwork] ✅ Found artwork in ${duration}ms using ${isBackupQuery ? 'backup' : 'primary'} query`);
          console.log(`[SpotifyArtwork] ℹ️ Album: "${result.albumName}", Track: "${result.trackName}", Artists: ${result.artists?.join(', ') || 'unknown'}`);
          console.log(`[SpotifyArtwork] 🖼️ Image URL: ${result.imageUrl}`);
          return result.imageUrl;
        } else {
          console.log(`[SpotifyArtwork] ⚠️ API returned success but no image URL found after ${duration}ms`);
          
          // If this is the primary query, continue to backup queries
          if (!isBackupQuery) continue;
        }
      } catch (error) {
        console.error(`[SpotifyArtwork] 🚨 ERROR calling API:`, error);
        console.error(`[SpotifyArtwork] Error in API call for query "${searchQuery}":`, error);
        
        // If this is the primary query, continue to backup queries
        if (!isBackupQuery) continue;
      }
    }
    
    console.log(`[SpotifyArtwork] ❌ All search queries failed to find Spotify artwork`);
    return null;
    
  } catch (error) {
    console.error(`[SpotifyArtwork] 🚨 TOP-LEVEL ERROR:`, error);
    console.error(`[SpotifyArtwork] Error getting Spotify artwork:`, error);
    return null;
  }
} 