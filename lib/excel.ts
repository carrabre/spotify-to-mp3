import type { Track } from "./types"

export function generateExcel(tracks: Track[]) {
  // Import xlsx dynamically to avoid server-side issues
  import("xlsx").then((XLSX) => {
    // Create worksheet
    const worksheet = XLSX.utils.json_to_sheet(
      tracks.map((track) => ({
        "Track Name": track.name,
        Artists: track.artists.join(", "),
        Album: track.album,
        "Duration (ms)": track.duration,
        "Spotify URL": track.spotifyUrl,
        "YouTube URL": track.youtubeId ? `https://www.youtube.com/watch?v=${track.youtubeId}` : "Not found",
      })),
    )

    // Create workbook
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "Tracks")

    // Generate Excel file
    XLSX.writeFile(workbook, "spotify-tracks.xlsx")
  })
}
