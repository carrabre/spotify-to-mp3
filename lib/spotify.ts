import type { Track, SpotifyTokenResponse, SpotifyTrack, SpotifyPlaylist, SpotifyAlbum } from "./types"

// Get Spotify access token
async function getSpotifyToken(): Promise<string> {
  const clientId = process.env.SPOTIFY_CLIENT_ID
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error("Spotify credentials are not configured")
  }

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
async function fetchTrack(id: string, token: string): Promise<Track[]> {
  const response = await fetch(`https://api.spotify.com/v1/tracks/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok) {
    throw new Error("Failed to fetch track from Spotify")
  }

  const track: SpotifyTrack = await response.json()
  return [convertSpotifyTrack(track)]
}

// Fetch album data with pagination
async function fetchAlbum(id: string, token: string): Promise<Track[]> {
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

  return tracks.map((track) => {
    // Album tracks don't include album info, so we need to add it
    const trackWithAlbum = {
      ...track,
      album: {
        name: album.name,
        images: album.images || [],
      },
    }
    return convertSpotifyTrack(trackWithAlbum)
  })
}

// Fetch playlist data with pagination
async function fetchPlaylist(id: string, token: string): Promise<Track[]> {
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

  return trackItems
    .filter((item) => item.track) // Filter out null tracks
    .map((item) => convertSpotifyTrack(item.track))
}

// Main function to fetch Spotify data
export async function fetchSpotifyData(url: string): Promise<Track[]> {
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
