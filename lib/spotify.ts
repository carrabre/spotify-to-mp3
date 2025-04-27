import type { Track, SpotifyTokenResponse, SpotifyTrack, SpotifyPlaylist, SpotifyAlbum } from "./types"
import getConfig from 'next/config'

// Load environment variables from multiple potential sources
function loadEnvVariables() {
  // Create debug info object to track where vars are found
  const debugInfo = {
    sources: [] as string[],
    found: false
  };

  // Check direct process.env first (most common)
  let clientId = process.env.SPOTIFY_CLIENT_ID;
  let clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  
  if (clientId && clientSecret) {
    debugInfo.sources.push('process.env');
    debugInfo.found = true;
    return { clientId, clientSecret, debugInfo };
  }

  // Try Next.js config
  try {
    const nextConfig = getConfig();
    if (nextConfig) {
      debugInfo.sources.push('next/config');
      
      // Check serverRuntimeConfig
      if (nextConfig.serverRuntimeConfig) {
        if (!clientId && nextConfig.serverRuntimeConfig.SPOTIFY_CLIENT_ID) {
          clientId = nextConfig.serverRuntimeConfig.SPOTIFY_CLIENT_ID;
        }
        if (!clientSecret && nextConfig.serverRuntimeConfig.SPOTIFY_CLIENT_SECRET) {
          clientSecret = nextConfig.serverRuntimeConfig.SPOTIFY_CLIENT_SECRET;
        }
      }
      
      // Check env property
      if (nextConfig.env) {
        if (!clientId && nextConfig.env.SPOTIFY_CLIENT_ID) {
          clientId = nextConfig.env.SPOTIFY_CLIENT_ID;
        }
        if (!clientSecret && nextConfig.env.SPOTIFY_CLIENT_SECRET) {
          clientSecret = nextConfig.env.SPOTIFY_CLIENT_SECRET;
        }
      }
    }
  } catch (error) {
    debugInfo.sources.push('next/config (failed)');
    console.error("Error accessing Next.js config:", error);
  }

  // Check global object as a last resort (for Vercel edge functions)
  if (typeof globalThis !== 'undefined') {
    debugInfo.sources.push('globalThis');
    if (!clientId && (globalThis as any).SPOTIFY_CLIENT_ID) {
      clientId = (globalThis as any).SPOTIFY_CLIENT_ID;
    }
    if (!clientSecret && (globalThis as any).SPOTIFY_CLIENT_SECRET) {
      clientSecret = (globalThis as any).SPOTIFY_CLIENT_SECRET;
    }
  }

  // Fallback to hardcoded env vars in development ONLY if needed
  if (process.env.NODE_ENV === 'development' && (!clientId || !clientSecret)) {
    debugInfo.sources.push('fallback development values');
    // Only use these in development, never in production
    if (!clientId) clientId = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID || '';
    if (!clientSecret) clientSecret = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_SECRET || '';
  }

  debugInfo.found = !!(clientId && clientSecret);
  return { clientId, clientSecret, debugInfo };
}

// Get Spotify access token
export async function getSpotifyToken(): Promise<string> {
  // Load credentials from all possible sources
  const { clientId, clientSecret, debugInfo } = loadEnvVariables();

  if (!clientId || !clientSecret) {
    console.error("SPOTIFY ENV DEBUG:", {
      clientIdExists: !!clientId,
      clientSecretExists: !!clientSecret,
      sources: debugInfo.sources,
      processEnvKeys: Object.keys(process.env).filter(key => key.startsWith('SPOTIFY') || key.startsWith('NEXT')).join(', ')
    });
    throw new Error(`Spotify credentials are not configured. ClientID: ${clientId ? "Set" : "Missing"}, ClientSecret: ${clientSecret ? "Set" : "Missing"}`)
  }

  console.log("Spotify credentials found via:", debugInfo.sources);

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
    }),
  })

  if (!response.ok) {
    throw new Error("Failed to get Spotify access token")
  }

  const data: SpotifyTokenResponse = await response.json()
  return data.access_token
}

// Convert Spotify track to our Track format
function convertSpotifyTrack(spotifyTrack: SpotifyTrack): Track {
  return {
    id: spotifyTrack.id,
    name: spotifyTrack.name,
    artists: spotifyTrack.artists.map((artist) => artist.name),
    album: spotifyTrack.album.name,
    albumImageUrl: spotifyTrack.album.images.length > 0 ? spotifyTrack.album.images[0].url : null,
    duration: spotifyTrack.duration_ms,
    spotifyUrl: spotifyTrack.external_urls.spotify,
    youtubeId: null,
    youtubeTitle: null,
    youtubeThumbnail: null,
  }
}

// Extract Spotify ID from URL
function extractSpotifyId(url: string): { type: "track" | "album" | "playlist"; id: string } {
  const trackMatch = url.match(/track\/([a-zA-Z0-9]+)/)
  const albumMatch = url.match(/album\/([a-zA-Z0-9]+)/)
  const playlistMatch = url.match(/playlist\/([a-zA-Z0-9]+)/)

  if (trackMatch) return { type: "track", id: trackMatch[1] }
  if (albumMatch) return { type: "album", id: albumMatch[1] }
  if (playlistMatch) return { type: "playlist", id: playlistMatch[1] }

  throw new Error("Invalid Spotify URL. Please provide a track, album, or playlist URL.")
}

// Fetch track data
async function fetchTrack(id: string, token: string): Promise<{ tracks: Track[], sourceName: string }> {
  const response = await fetch(`https://api.spotify.com/v1/tracks/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok) {
    throw new Error("Failed to fetch track from Spotify")
  }

  const track: SpotifyTrack = await response.json()
  return { 
    tracks: [convertSpotifyTrack(track)],
    sourceName: `${track.artists.map(a => a.name).join(", ")} - ${track.name}`
  }
}

// Fetch album data with pagination
async function fetchAlbum(id: string, token: string): Promise<{ tracks: Track[], sourceName: string }> {
  const albumResponse = await fetch(`https://api.spotify.com/v1/albums/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!albumResponse.ok) {
    throw new Error("Failed to fetch album from Spotify")
  }

  const album: SpotifyAlbum = await albumResponse.json()

  // Get initial tracks
  let tracks = [...album.tracks.items]
  let nextUrl = album.tracks.next

  // Fetch additional pages if they exist
  while (nextUrl) {
    const tracksResponse = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!tracksResponse.ok) {
      console.error("Failed to fetch additional album tracks")
      break
    }

    const tracksData = await tracksResponse.json()
    tracks = [...tracks, ...tracksData.items]
    nextUrl = tracksData.next
  }

  return {
    tracks: tracks.map((track) => {
      // Album tracks don't include album info, so we need to add it
      const trackWithAlbum = {
        ...track,
        album: {
          name: album.name,
          images: album.images || [],
        },
      }
      return convertSpotifyTrack(trackWithAlbum)
    }),
    sourceName: album.name
  }
}

// Fetch playlist data with pagination
async function fetchPlaylist(id: string, token: string): Promise<{ tracks: Track[], sourceName: string }> {
  const playlistResponse = await fetch(`https://api.spotify.com/v1/playlists/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!playlistResponse.ok) {
    throw new Error("Failed to fetch playlist from Spotify")
  }

  const playlist: SpotifyPlaylist = await playlistResponse.json()

  // Get initial tracks
  let trackItems = [...playlist.tracks.items]
  let nextUrl = playlist.tracks.next

  // Fetch additional pages if they exist
  while (nextUrl) {
    const tracksResponse = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!tracksResponse.ok) {
      console.error("Failed to fetch additional playlist tracks")
      break
    }

    const tracksData = await tracksResponse.json()
    trackItems = [...trackItems, ...tracksData.items]
    nextUrl = tracksData.next
  }

  return {
    tracks: trackItems
      .filter((item) => item.track) // Filter out null tracks
      .map((item) => convertSpotifyTrack(item.track)),
    sourceName: playlist.name
  }
}

// Main function to fetch Spotify data
export async function fetchSpotifyData(url: string): Promise<{ tracks: Track[], sourceName: string }> {
  try {
    const { type, id } = extractSpotifyId(url)
    const token = await getSpotifyToken()

    switch (type) {
      case "track":
        return await fetchTrack(id, token)
      case "album":
        return await fetchAlbum(id, token)
      case "playlist":
        return await fetchPlaylist(id, token)
      default:
        throw new Error("Unsupported Spotify URL type")
    }
  } catch (error) {
    console.error("Error fetching Spotify data:", error)
    if (error instanceof Error) {
      throw error
    } else {
      throw new Error("Unknown error fetching Spotify data")
    }
  }
}
