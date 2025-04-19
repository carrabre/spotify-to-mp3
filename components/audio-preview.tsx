"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Play, Pause, Volume2, VolumeX } from "lucide-react"
import { Progress } from "@/components/ui/progress"

interface AudioPreviewProps {
  videoId: string
  title: string
  children: React.ReactNode
}

export default function AudioPreview({ videoId, title, children }: AudioPreviewProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen && !audio) {
      // Create audio element when dialog opens
      const audioElement = new Audio(`https://www.youtube.com/embed/${videoId}?autoplay=0`)

      audioElement.addEventListener("loadedmetadata", () => {
        setDuration(audioElement.duration)
      })

      audioElement.addEventListener("timeupdate", () => {
        setProgress((audioElement.currentTime / audioElement.duration) * 100)
      })

      audioElement.addEventListener("ended", () => {
        setIsPlaying(false)
      })

      audioElement.addEventListener("error", (e) => {
        console.error("Audio error:", e)
        setError("Failed to load audio preview. Try opening on YouTube instead.")
      })

      setAudio(audioElement)
    }

    return () => {
      if (audio) {
        audio.pause()
        audio.src = ""
        audio.removeAttribute("src")
        setAudio(null)
      }
    }
  }, [isOpen, videoId])

  const togglePlay = () => {
    if (!audio) return

    if (isPlaying) {
      audio.pause()
    } else {
      audio.play().catch((err) => {
        console.error("Failed to play audio:", err)
        setError("Browser policy prevents automatic playback. Please try opening on YouTube.")
      })
    }

    setIsPlaying(!isPlaying)
  }

  const toggleMute = () => {
    if (!audio) return

    audio.muted = !audio.muted
    setIsMuted(!isMuted)
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-lg">{title}</DialogTitle>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          {error ? (
            <div className="p-4 bg-red-50 text-red-700 rounded-md">{error}</div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" className="h-10 w-10 rounded-full" onClick={togglePlay}>
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>

                <div className="flex-1">
                  <Progress value={progress} className="h-2" />
                </div>

                <Button variant="outline" size="icon" className="h-8 w-8 rounded-full" onClick={toggleMute}>
                  {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </Button>
              </div>

              <p className="text-xs text-center text-gray-500">
                Note: Audio preview may be limited due to browser policies. For full audio, download the MP3 or open on
                YouTube.
              </p>
            </div>
          )}

          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
