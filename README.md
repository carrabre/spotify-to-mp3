# Spotify to MP3 Converter

A web application to convert Spotify and Apple Music playlists to MP3 files.

## Features

- Convert Spotify tracks, albums, and playlists to MP3
- **NEW**: Convert Apple Music playlists to MP3
- Search for YouTube videos matching your Spotify/Apple Music tracks
- Download individual tracks or entire playlists as MP3 files with embedded artwork
- Auto-matching of tracks with YouTube videos
- Beautiful and responsive UI

## How It Works

1. Enter a Spotify or Apple Music URL (track, album, or playlist)
2. The app extracts track information from the platform
3. It automatically searches for matching YouTube videos
4. You can verify and adjust the YouTube matches if needed
5. Download tracks individually or as a batch with album artwork embedded

## Development

This is a Next.js application with TypeScript.

### Setup

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

### Environment Variables

Create a `.env.local` file with the following:

```
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
```

You can get these credentials by creating an application in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard/applications).

## License

MIT 