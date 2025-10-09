'use client'

import * as React from "react"
import { cn } from "../../lib/utils"
import { Input } from "./input"
import { Check, Loader2, Upload, AlertCircle } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "./button"
import { Progress } from "./progress"
import { UploadConfig } from "@/types/upload"

export interface LinkOrDropProps
    extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onProgress'> {
    onUrlChange?: (url: string) => void
    onProgress?: (percentage: number) => void
    config?: UploadConfig
}

const LinkOrDrop = React.forwardRef<HTMLInputElement, LinkOrDropProps>(
    ({ className, onUrlChange, onProgress, config, ...props }, ref) => {
        const [isDragging, setIsDragging] = React.useState(false)
        const [isUploading, setIsUploading] = React.useState(false)
        const [showCheck, setShowCheck] = React.useState(false)
        const [uploadProgress, setUploadProgress] = React.useState<number>(0)
        const [uploadError, setUploadError] = React.useState<string | null>(null)
        const inputRef = React.useRef<HTMLInputElement>(null)
        const fileInputRef = React.useRef<HTMLInputElement>(null)
        const combinedRef = (ref as any) || inputRef

        const handleDragOver = React.useCallback((e: React.DragEvent) => {
            e.preventDefault()
            e.stopPropagation()
            setIsDragging(true)
        }, [])

        const handleDragLeave = React.useCallback((e: React.DragEvent) => {
            e.preventDefault()
            e.stopPropagation()
            setIsDragging(false)
        }, [])

        const handleFileUpload = React.useCallback(async (file: File) => {
            setIsUploading(true)
            setUploadProgress(0)
            setUploadError(null) // Clear any previous errors
            
            try {
                // Step 1: Get pre-signed URL from our API
                const presignedResponse = await fetch('/api/upload/presigned-url', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        filename: file.name,
                        contentType: file.type,
                        config: config
                    })
                })

                if (!presignedResponse.ok) {
                    const error = await presignedResponse.json()
                    const errorMessage = error.error || 'Failed to get upload URL'
                    
                    // Set user-friendly error messages based on status
                    if (presignedResponse.status === 403) {
                        throw new Error('You do not have permission to upload files')
                    } else if (presignedResponse.status === 401) {
                        throw new Error('Please sign in to upload files')
                    } else {
                        throw new Error(errorMessage)
                    }
                }

                const { url: presignedUrl, publicUrl } = await presignedResponse.json()

                // Step 2: Upload directly to S3 with progress tracking
                await new Promise<void>((resolve, reject) => {
                    const xhr = new XMLHttpRequest()

                    // Track upload progress
                    xhr.upload.onprogress = (event) => {
                        if (event.lengthComputable) {
                            const percentage = Math.round((event.loaded / event.total) * 100)
                            setUploadProgress(percentage)
                            onProgress?.(percentage)
                        }
                    }

                    xhr.onload = () => {
                        if (xhr.status >= 200 && xhr.status < 300) {
                            resolve()
                        } else {
                            reject(new Error(`Upload failed with status ${xhr.status}`))
                        }
                    }

                    xhr.onerror = () => {
                        // Check if it's a CORS error
                        reject(new Error('Upload failed. Please check your connection or contact support'))
                    }
                    
                    xhr.ontimeout = () => reject(new Error('Upload timeout. Please try again'))

                    xhr.open('PUT', presignedUrl)
                    xhr.setRequestHeader('Content-Type', file.type)
                    xhr.send(file)
                })

                // Step 3: Update with public URL
                if (combinedRef.current) {
                    combinedRef.current.value = publicUrl
                }
                onUrlChange?.(publicUrl)
                setShowCheck(true)
                setTimeout(() => setShowCheck(false), 2000)
            } catch (error) {
                console.error('Upload error:', error)
                
                // Set error message for UI display
                const errorMessage = error instanceof Error ? error.message : 'Failed to upload file'
                setUploadError(errorMessage)
                
                // Auto-hide error after 5 seconds
                setTimeout(() => setUploadError(null), 5000)
                
                // Reset progress on error
                setUploadProgress(0)
                onProgress?.(0)
            } finally {
                setIsUploading(false)
                // Reset progress after a short delay
                setTimeout(() => setUploadProgress(0), 500)
            }
        }, [combinedRef, onUrlChange, onProgress, config])

        const handleDrop = React.useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
            e.preventDefault()
            e.stopPropagation()
            setIsDragging(false)

            const file = e.dataTransfer.files[0]
            if (file) {
                await handleFileUpload(file)
            }
        }, [handleFileUpload])


        const handleFileSelect = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0]
            if (file) {
                handleFileUpload(file)
            }
        }, [handleFileUpload])

        return (
            <>
                <div
                    className={cn(
                        "relative",
                        isDragging && "ring-2 ring-primary ring-offset-2",
                        className
                    )}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    <Input
                        ref={combinedRef}
                        {...props}
                        className={cn(
                            "pr-20",
                            uploadError && "border-destructive focus-visible:ring-destructive"
                        )}
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center gap-2 pr-3">
                        <AnimatePresence>
                            {isUploading && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                >
                                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                </motion.div>
                            )}
                            {showCheck && !isUploading && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.5 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.5 }}
                                >
                                    <Check className="h-4 w-4 text-green-500" />
                                </motion.div>
                            )}
                            {uploadError && !isUploading && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.5 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.5 }}
                                >
                                    <AlertCircle className="h-4 w-4 text-destructive" />
                                </motion.div>
                            )}
                        </AnimatePresence>
                        <button
                            type="button"
                            className="h-6 w-6 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <Upload className="h-4 w-4" />
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            className="hidden"
                            onChange={handleFileSelect}
                        />
                    </div>
                    {isDragging && (
                        <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                            <p className="text-sm text-muted-foreground">Drop file here to upload</p>
                        </div>
                    )}
                </div>
                {uploadProgress > 0 && uploadProgress < 100 && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="mt-2 space-y-1"
                    >
                        <Progress value={uploadProgress} className="h-2" />
                        <p className="text-xs text-muted-foreground">
                            Uploading: {uploadProgress}%
                        </p>
                    </motion.div>
                )}
                {uploadError && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="mt-2 flex items-start gap-2 text-sm text-destructive"
                    >
                        <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <p>{uploadError}</p>
                    </motion.div>
                )}
            </>
        )
    }
)
LinkOrDrop.displayName = "LinkOrDrop"

export { LinkOrDrop }
