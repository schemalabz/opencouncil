"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { useDebounce } from "@/hooks/use-debounce"
import { Loader2, AlertCircle } from "lucide-react"
import { isValidYouTubeUrl } from "@/lib/utils/youtube"

interface YouTubePreviewProps {
  url: string
}

interface OEmbedData {
  title: string
  thumbnail_url: string
  author_name: string
  provider_name: string
}

export function YouTubePreview({ url }: YouTubePreviewProps) {
  const [data, setData] = useState<OEmbedData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Debounce the URL to avoid spamming requests
  const debouncedUrl = useDebounce(url, 500)

  useEffect(() => {
    // Reset if URL is empty
    if (!debouncedUrl) {
      setData(null)
      setError(null)
      return
    }

    // Basic validation to match API route regex before calling
    if (!isValidYouTubeUrl(debouncedUrl)) {
        // Not a YouTube URL, just clear everything silently (unless it was previously valid)
        setData(null)
        setError(null)
        return 
    }

    const fetchPreview = async () => {
      setLoading(true)
      setError(null)
      
      try {
        const response = await fetch(`/api/oembed?url=${encodeURIComponent(debouncedUrl)}`)
        
        if (!response.ok) {
           setError("Could not load preview")
           setData(null)
           return
        }
        
        const result = await response.json()
        setData(result)
      } catch (err) {
        console.error(err)
        setError("Could not load preview")
        setData(null)
      } finally {
        setLoading(false)
      }
    }

    fetchPreview()
  }, [debouncedUrl])

  if (!url) return null

  // If we are loading, show a small loader
  if (loading) {
      return (
          <div className="flex items-center space-x-2 text-sm text-muted-foreground mt-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading preview...</span>
          </div>
      )
  }

  // If error, show small warning
  if (error) {
      return (
          <div className="flex items-center space-x-2 text-sm text-yellow-600 mt-2">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
          </div>
      )
  }

  // If no data, return null
  if (!data) return null

  return (
    <Card className="mt-2 overflow-hidden bg-muted/40" disableHover>
      <div className="flex p-3 gap-3">
        <div className="relative aspect-video h-20 w-32 shrink-0 rounded-md overflow-hidden bg-black/10">
          {data.thumbnail_url ? (
             <img 
               src={data.thumbnail_url} 
               alt={data.title}
               className="h-full w-full object-cover"
             />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted">
                <span className="text-xs text-muted-foreground">No image</span>
            </div>
          )}
        </div>
        <div className="flex flex-col justify-center min-w-0">
          <h4 className="font-medium text-sm line-clamp-2 leading-tight mb-1" title={data.title}>
            {data.title}
          </h4>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
             <span>{data.author_name || data.provider_name || "YouTube"}</span>
          </div>
        </div>
      </div>
    </Card>
  )
}

