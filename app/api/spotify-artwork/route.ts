import { NextRequest, NextResponse } from 'next/server';
import { getSpotifyToken } from '@/lib/spotify';

export async function GET(request: NextRequest) {
  console.log(`[SpotifyArtwork] 🚨 API ENDPOINT CALLED at ${new Date().toISOString()}`);
  console.log(`[SpotifyArtwork] 🚨 Full URL: ${request.url}`);
  
  try {
    const requestId = Math.random().toString(36).substring(2, 8);
    const startTime = Date.now();
    console.log(`[SpotifyArtwork][${requestId}] Starting request at ${new Date().toISOString()}`);
    
    // Get query parameter for search
    const q = request.nextUrl.searchParams.get('q');
    console.log(`[SpotifyArtwork] 🚨 QUERY PARAM: q=${q}`);
    
    if (!q) {
      console.log(`[SpotifyArtwork][${requestId}] Missing search query parameter`);
      return NextResponse.json(
        { error: 'Missing search query' },
        { status: 400 }
      );
    }
    
    console.log(`[SpotifyArtwork][${requestId}] Searching for artwork with query: "${q}"`);
    
    // Get Spotify access token
    console.log(`[SpotifyArtwork][${requestId}] Getting Spotify access token...`);
    console.log(`[SpotifyArtwork] 🚨 CALLING getSpotifyToken()`);
    const tokenStart = Date.now();
    
    let accessToken;
    try {
      accessToken = await getSpotifyToken();
      console.log(`[SpotifyArtwork] 🚨 TOKEN RECEIVED: ${accessToken ? 'yes (truncated): ' + accessToken.substring(0, 10) + '...' : 'no'}`);
    } catch (tokenError) {
      console.error(`[SpotifyArtwork] 🚨 TOKEN ERROR:`, tokenError);
      return NextResponse.json(
        { error: 'Failed to get Spotify token', details: tokenError instanceof Error ? tokenError.message : String(tokenError) },
        { status: 500 }
      );
    }
    
    const tokenDuration = Date.now() - tokenStart;
    
    if (!accessToken) {
      console.error(`[SpotifyArtwork][${requestId}] Failed to get Spotify access token after ${tokenDuration}ms`);
      return NextResponse.json(
        { error: 'Failed to authenticate with Spotify' },
        { status: 500 }
      );
    }
    
    console.log(`[SpotifyArtwork][${requestId}] Obtained access token in ${tokenDuration}ms`);
    
    // Search for tracks matching the query
    console.log(`[SpotifyArtwork][${requestId}] Calling Spotify search API...`);
    console.log(`[SpotifyArtwork] 🚨 SPOTIFY API URL: https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=5`);
    
    const searchStart = Date.now();
    
    let searchResponse;
    try {
      searchResponse = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=5`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        }
      );
      console.log(`[SpotifyArtwork] 🚨 SPOTIFY SEARCH RESPONSE: status=${searchResponse.status}`);
    } catch (fetchError) {
      console.error(`[SpotifyArtwork] 🚨 FETCH ERROR:`, fetchError);
      return NextResponse.json(
        { error: 'Error fetching from Spotify API', details: fetchError instanceof Error ? fetchError.message : String(fetchError) },
        { status: 500 }
      );
    }
    
    const searchDuration = Date.now() - searchStart;
    
    if (!searchResponse.ok) {
      console.error(`[SpotifyArtwork][${requestId}] Spotify search API error: ${searchResponse.status} ${searchResponse.statusText} after ${searchDuration}ms`);
      
      // Try to get more error details
      try {
        const errorJson = await searchResponse.json();
        console.error(`[SpotifyArtwork] 🚨 SPOTIFY ERROR DETAILS:`, errorJson);
      } catch (e) {
        console.error(`[SpotifyArtwork] 🚨 Could not parse Spotify error response`);
      }
      
      return NextResponse.json(
        { error: 'Failed to search Spotify' },
        { status: searchResponse.status }
      );
    }
    
    console.log(`[SpotifyArtwork][${requestId}] Spotify search API response received in ${searchDuration}ms`);
    
    let searchData;
    try {
      searchData = await searchResponse.json();
      console.log(`[SpotifyArtwork] 🚨 SEARCH DATA RECEIVED:`, 
        searchData.tracks?.items?.length 
          ? `${searchData.tracks.items.length} tracks found` 
          : 'No tracks found');
    } catch (jsonError) {
      console.error(`[SpotifyArtwork] 🚨 JSON PARSING ERROR:`, jsonError);
      return NextResponse.json(
        { error: 'Error parsing Spotify response', details: jsonError instanceof Error ? jsonError.message : String(jsonError) },
        { status: 500 }
      );
    }
    
    // Check if we got any tracks
    if (!searchData.tracks || !searchData.tracks.items || searchData.tracks.items.length === 0) {
      console.log(`[SpotifyArtwork][${requestId}] No tracks found for query: "${q}"`);
      return NextResponse.json(
        { error: 'No tracks found' },
        { status: 404 }
      );
    }
    
    console.log(`[SpotifyArtwork][${requestId}] Found ${searchData.tracks.items.length} tracks matching query`);
    
    // Get the first track
    const track = searchData.tracks.items[0];
    console.log(`[SpotifyArtwork] 🚨 FIRST TRACK: "${track.name}" by ${track.artists.map((a: any) => a.name).join(', ')}`);
    
    // Check if the track has album images
    if (!track.album || !track.album.images || track.album.images.length === 0) {
      console.log(`[SpotifyArtwork][${requestId}] Track found but no album images available`);
      return NextResponse.json(
        { error: 'No album artwork found' },
        { status: 404 }
      );
    }
    
    // Get the highest quality image (first one is usually highest quality)
    const imageUrl = track.album.images[0].url;
    const albumName = track.album.name;
    
    console.log(`[SpotifyArtwork][${requestId}] Found album artwork for "${track.name}" by ${track.artists.map((a: any) => a.name).join(', ')}`);
    console.log(`[SpotifyArtwork][${requestId}] Album: "${albumName}", Image URL: ${imageUrl}`);
    console.log(`[SpotifyArtwork] 🚨 IMAGE URL FOUND: ${imageUrl}`);
    
    const totalDuration = Date.now() - startTime;
    console.log(`[SpotifyArtwork][${requestId}] Request completed in ${totalDuration}ms`);
    console.log(`[SpotifyArtwork] 🚨 REQUEST COMPLETE - SUCCESS`);
    
    // Return image URL and album name
    return NextResponse.json({
      imageUrl,
      albumName,
      trackName: track.name,
      artists: track.artists.map((a: any) => a.name),
      requestId,
      duration: totalDuration
    });
    
  } catch (error) {
    console.error('[SpotifyArtwork] Error:', error instanceof Error ? error.message : String(error));
    console.error('[SpotifyArtwork] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error(`[SpotifyArtwork] 🚨 FATAL ERROR: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 