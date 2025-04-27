import { NextRequest, NextResponse } from 'next/server';

// Default fallback images for when Spotify search fails
const FALLBACK_IMAGES = [
  'https://i.scdn.co/image/ab67616d0000b273af5fa7db0267b70e0f589bc5',
  'https://i.scdn.co/image/ab67616d0000b273802686d91a6c8c9dc4993b0e',
  'https://i.scdn.co/image/ab67616d0000b273db8a6b28efbe72b1b73e2c23',
  'https://i.scdn.co/image/ab67616d0000b273aad36b8e5c7e8a09350b8282',
  'https://i.scdn.co/image/ab67616d0000b273395dc1475dc8b1b343eb2695',
];

// Generate a consistent fallback image based on query
function getFallbackImage(query: string): string {
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < query.length; i++) {
    hash = ((hash << 5) - hash) + query.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  const index = Math.abs(hash) % FALLBACK_IMAGES.length;
  return FALLBACK_IMAGES[index];
}

export async function GET(request: NextRequest) {
  try {
    // Get query parameter
    const query = request.nextUrl.searchParams.get('q');
    if (!query) {
      return NextResponse.json({ error: 'Missing query parameter' }, { status: 400 });
    }

    console.log('[SpotifyArtwork] Searching for artwork with query:', JSON.stringify(query));

    // Get access token from our token API
    const tokenResponse = await fetch(new URL('/api/spotify-token', request.url).toString());
    if (!tokenResponse.ok) {
      console.error('[SpotifyArtwork] Failed to get token:', tokenResponse.status);
      // Return a fallback image URL instead of failing
      const fallbackUrl = getFallbackImage(query);
      return NextResponse.json({ url: fallbackUrl, fallback: true });
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      console.error('[SpotifyArtwork] Token API returned no access token');
      // Return a fallback image URL
      const fallbackUrl = getFallbackImage(query);
      return NextResponse.json({ url: fallbackUrl, fallback: true });
    }
    
    // Clean the query to improve search results
    const cleanQuery = query.replace(/[\[\](){}]/g, '').trim();
    console.log('[SpotifyArtwork] Cleaned query:', cleanQuery);

    // Search Spotify for tracks matching the query
    const searchUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(cleanQuery)}&type=track&limit=5`;
    console.log('[SpotifyArtwork] Searching Spotify with URL:', searchUrl);
    
    const searchResponse = await fetch(searchUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!searchResponse.ok) {
      console.error('[SpotifyArtwork] Spotify search failed:', searchResponse.status);
      const responseText = await searchResponse.text();
      console.error('[SpotifyArtwork] Error response:', responseText);
      
      // Return a fallback image URL
      const fallbackUrl = getFallbackImage(query);
      return NextResponse.json({ url: fallbackUrl, fallback: true });
    }

    const searchData = await searchResponse.json();
    
    if (!searchData.tracks || !searchData.tracks.items || searchData.tracks.items.length === 0) {
      console.log('[SpotifyArtwork] No tracks found for query:', cleanQuery);
      
      // Return a fallback image URL
      const fallbackUrl = getFallbackImage(query);
      return NextResponse.json({ url: fallbackUrl, fallback: true });
    }

    // Get the first track's album artwork
    const track = searchData.tracks.items[0];
    
    if (!track.album || !track.album.images || track.album.images.length === 0) {
      console.log('[SpotifyArtwork] Track found but no album images available');
      
      // Return a fallback image URL
      const fallbackUrl = getFallbackImage(query);
      return NextResponse.json({ url: fallbackUrl, fallback: true });
    }

    // Get the highest resolution image (first one)
    const imageUrl = track.album.images[0].url;
    
    console.log('[SpotifyArtwork] Found album artwork:', imageUrl);
    console.log('[SpotifyArtwork] For track:', track.name, 'by', track.artists[0].name);
    
    return NextResponse.json({ 
      url: imageUrl,
      track: {
        name: track.name,
        artist: track.artists.map((a: any) => a.name).join(', '),
        album: track.album.name
      }
    });
  } catch (error) {
    console.error('[SpotifyArtwork] Error:', error);
    
    // Get query parameter for fallback
    const query = request.nextUrl.searchParams.get('q') || 'unknown';
    const fallbackUrl = getFallbackImage(query);
    
    return NextResponse.json({ 
      url: fallbackUrl,
      fallback: true,
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
} 