import { create } from 'zustand'
import type { Track } from '@/lib/types'
import type { StateCreator } from 'zustand'

interface DownloadState {
  // General download state
  isDownloading: boolean
  progress: number
  currentTrack: string | null
  processedCount: number
  totalTracks: number
  error: string | null
  
  // Actions
  startDownload: () => AbortController
  setDownloadState: (state: Partial<Omit<DownloadState, 'startDownload' | 'setDownloadState'>>) => void
  reset: () => void
}

export const useDownloadStore = create<DownloadState>((set) => ({
  // Initial state
  isDownloading: false,
  progress: 0,
  currentTrack: null,
  processedCount: 0,
  totalTracks: 0,
  error: null,
  
  // Actions
  startDownload: () => {
    const controller = new AbortController()
    set({
      isDownloading: true,
      progress: 0,
      currentTrack: null,
      processedCount: 0,
      totalTracks: 0,
      error: null
    })
    return controller
  },
  
  setDownloadState: (state) => set((prev) => ({ ...prev, ...state })),
  
  reset: () => set({
    isDownloading: false,
    progress: 0,
    currentTrack: null,
    processedCount: 0,
    totalTracks: 0,
    error: null
  })
})) 