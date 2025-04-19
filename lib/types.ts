export interface Track {
  id: string
  name: string
  artists: string[]
  album: string
  albumImageUrl: string | null
  duration: number
  spotifyUrl: string
  youtubeId: string | null
  youtubeTitle: string | null
  youtubeThumbnail: string | null
  verified?: boolean
  verificationAttempts?: number
}

export interface YouTubeVideo {
  id: string
  title: string
  thumbnail: string | null
}

export interface SpotifyTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}

export interface SpotifyTrack {
  id: string
  name: string
  artists: { name: string }[]
  album: {
    name: string
    images: { url: string }[]
  }
  duration_ms: number
  external_urls: {
    spotify: string
  }
}

export interface SpotifyPlaylist {
  tracks: {
    items: {
      track: SpotifyTrack
    }[]
    next: string | null
  }
}

export interface SpotifyAlbum {
  tracks: {
    items: SpotifyTrack[]
    next: string | null
  }
  name: string
  images: { url: string }[]
}
