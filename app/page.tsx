import SpotifyConverter from "@/components/spotify-converter"
import DownloadGuide from "@/components/download-guide"

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-green-50 to-green-100 dark:from-gray-900 dark:to-gray-800 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <header className="text-center mb-12">
          <h1 className="text-4xl font-bold text-green-600 dark:text-green-400 mb-4">Spotify to MP3 Converter</h1>
          <p className="text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            Convert your favorite Spotify playlists and tracks to MP3 files.
          </p>
        </header>

        <SpotifyConverter />
        <DownloadGuide />
      </div>
    </main>
  )
}
