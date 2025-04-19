"use client"

import type React from "react"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ExternalLink } from "lucide-react"

interface YouTubePreviewProps {
  videoId: string
  title: string
  children: React.ReactNode
}

export default function YouTubePreview({ videoId, title, children }: YouTubePreviewProps) {
  const [isOpen, setIsOpen] = useState(false)

  // Ensure the video ID is valid
  const isValidVideoId = videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId)

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="text-lg">{title}</DialogTitle>
        </DialogHeader>
        <div className="mt-4 space-y-4">
          {isValidVideoId ? (
            <div className="aspect-video relative bg-gray-100 dark:bg-gray-800 rounded-md overflow-hidden">
              <iframe
                src={`https://www.youtube.com/embed/${videoId}`}
                title={title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 w-full h-full"
              />
            </div>
          ) : (
            <div className="aspect-video flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-md">
              <p className="text-gray-500">Video preview not available</p>
            </div>
          )}
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Close
            </Button>
            <a
              href={`https://www.youtube.com/watch?v=${videoId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Open on YouTube
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
