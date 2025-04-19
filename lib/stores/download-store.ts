import { create } from 'zustand'

interface DownloadState {
  downloadProgress: Record<string, number>
  downloadErrors: Record<string, string>
  downloadingTracks: Record<string, boolean>
  setDownloadProgress: (trackId: string, progress: number) => void
  setDownloadError: (trackId: string, error: string) => void
  setDownloadingTrack: (trackId: string, isDownloading: boolean) => void
  clearDownloadState: (trackId: string) => void
  clearAllDownloadStates: () => void
}

export const useDownloadStore = create<DownloadState>((set) => ({
  downloadProgress: {},
  downloadErrors: {},
  downloadingTracks: {},
  setDownloadProgress: (trackId, progress) =>
    set((state) => ({
      downloadProgress: { ...state.downloadProgress, [trackId]: progress },
    })),
  setDownloadError: (trackId, error) =>
    set((state) => ({
      downloadErrors: { ...state.downloadErrors, [trackId]: error },
    })),
  setDownloadingTrack: (trackId, isDownloading) =>
    set((state) => ({
      downloadingTracks: { ...state.downloadingTracks, [trackId]: isDownloading },
    })),
  clearDownloadState: (trackId) =>
    set((state) => {
      const { [trackId]: _, ...remainingProgress } = state.downloadProgress
      const { [trackId]: __, ...remainingErrors } = state.downloadErrors
      const { [trackId]: ___, ...remainingDownloading } = state.downloadingTracks
      return {
        downloadProgress: remainingProgress,
        downloadErrors: remainingErrors,
        downloadingTracks: remainingDownloading,
      }
    }),
  clearAllDownloadStates: () =>
    set({
      downloadProgress: {},
      downloadErrors: {},
      downloadingTracks: {},
    }),
})) 