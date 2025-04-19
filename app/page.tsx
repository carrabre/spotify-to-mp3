import SpotifyConverter from "@/components/spotify-converter"
import DownloadProgress from "@/components/download-progress"

export default function Home() {
  return (
    <main className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-green-400 via-green-500 to-green-600 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 px-4 py-8 sm:p-6 md:p-12">
      <div className="max-w-5xl mx-auto">
        <header className="text-center mb-8 sm:mb-16">
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4 sm:mb-6 drop-shadow-lg">
            Spotify to MP3 Converter
          </h1>
          <p className="text-lg sm:text-xl text-white/90 max-w-2xl mx-auto leading-relaxed drop-shadow">
            Convert your favorite Spotify playlists and tracks to MP3 files.
          </p>
        </header>

        <div className="backdrop-blur-xl bg-white/10 dark:bg-gray-900/50 rounded-2xl shadow-2xl p-4 sm:p-6 md:p-8 border border-white/20">
          <SpotifyConverter />
        </div>
      </div>
      <DownloadProgress />
    </main>
  )
}
