'use client'

import * as React from "react"
import { cn } from "../../lib/utils"
import { Input } from "./input"
import { Check, Loader2, Upload, AlertCircle } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "./button"
import { Progress } from "./progress"
import { uploadAccept, uploadFormatOfFile, type UploadConfig, type UploadPlan } from "@/types/upload"
import { apiErrorMessage } from "@/lib/utils/validationIssues"

export interface LinkOrDropProps
    extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onProgress'> {
    /** Styles the inner Input (the outer className styles the wrapper). */
    inputClassName?: string;
    onUrlChange?: (url: string) => void
    onProgress?: (percentage: number) => void
    /** What the file is for. Its kind decides which files the upload takes. */
    config: UploadConfig
}

/** The message of a refused request: the one the route gave, or one for a refused sign-in. */
async function requestError(response: Response, fallback: string): Promise<Error> {
    if (response.status === 401) return new Error('Please sign in to upload files')
    if (response.status === 403) return new Error('You do not have permission to upload files')
    const body = await response.json().catch(() => ({}))
    return new Error(apiErrorMessage(body, response.status, fallback))
}

/**
 * A PUT stops when no byte has moved for this long. A part of 1 GiB takes
 * about 30 minutes at 5 Mbit/s, so a limit on the whole request would stop a
 * slow line; a limit on silence stops only a dead one.
 */
export const PUT_STALL_MS = 2 * 60 * 1000

/** One PUT to the bucket, with progress. */
function put(url: string, body: Blob, headers: Record<string, string>, onProgress: (loaded: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        let stall: ReturnType<typeof setTimeout> | undefined
        const watch = () => {
            clearTimeout(stall)
            stall = setTimeout(() => xhr.abort(), PUT_STALL_MS)
        }
        const settle = (error?: Error) => {
            clearTimeout(stall)
            if (error) reject(error)
            else resolve()
        }
        xhr.upload.onprogress = event => {
            watch()
            onProgress(event.loaded)
        }
        xhr.onload = () => settle(xhr.status >= 200 && xhr.status < 300
            ? undefined
            : new Error(`Upload failed with status ${xhr.status}`))
        xhr.onerror = () => settle(new Error('Upload failed. Please check your connection or contact support'))
        xhr.onabort = () => settle(new Error('Upload stalled: no data moved for 2 minutes. Please try again'))
        xhr.open('PUT', url)
        for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value)
        xhr.send(body)
        watch()
    })
}

/**
 * Sends a file to the bucket as the server planned it: one PUT, or one PUT
 * per part and then the request that joins the parts. Returns the public URL.
 */
async function uploadFile(file: File, config: UploadConfig, onProgress: (percentage: number) => void): Promise<string> {
    const started = await fetch('/api/upload/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, sizeBytes: file.size, config }),
    })
    if (!started.ok) throw await requestError(started, 'Failed to get upload URL')
    const plan: UploadPlan = await started.json()

    let sent = 0
    for (const part of plan.parts) {
        const offset = (part.partNumber - 1) * plan.partSize
        const body = file.slice(offset, offset + plan.partSize)
        await put(part.uploadUrl, body, plan.headers, loaded => onProgress(Math.round(((sent + loaded) / file.size) * 100)))
        sent += body.size
    }

    if (plan.completion) {
        const completed = await fetch('/api/upload/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: plan.key, ...plan.completion, sizeBytes: file.size }),
        })
        if (!completed.ok) throw await requestError(completed, 'Failed to complete the upload')
    }
    return plan.publicUrl
}

const LinkOrDrop = React.forwardRef<HTMLInputElement, LinkOrDropProps>(
    ({ className, inputClassName, onUrlChange, onProgress, config, ...props }, ref) => {
        const accept = uploadAccept(config.kind)
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
            // A dropped file skips the picker's filter, so both paths check it.
            if (!uploadFormatOfFile(config.kind, file.name)) {
                setShowCheck(false)
                setUploadError(`This file type is not accepted (${accept})`)
                return
            }
            setIsUploading(true)
            setUploadProgress(0)
            setUploadError(null)
            setShowCheck(false) // Clear any previous errors

            try {
                const publicUrl = await uploadFile(file, config, percentage => {
                    setUploadProgress(percentage)
                    onProgress?.(percentage)
                })
                if (combinedRef.current) {
                    combinedRef.current.value = publicUrl
                }
                onUrlChange?.(publicUrl)
                setShowCheck(true)
                setTimeout(() => setShowCheck(false), 2000)
            } catch (error) {
                console.error('Upload error:', error)
                setUploadError(error instanceof Error ? error.message : 'Failed to upload file')
                setUploadProgress(0)
                onProgress?.(0)
            } finally {
                setIsUploading(false)
                // Reset progress after a short delay
                setTimeout(() => setUploadProgress(0), 500)
            }
        }, [combinedRef, onUrlChange, onProgress, config, accept])

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

        const clearError = React.useCallback(() => {
            setUploadError(null)
        }, [])

        const retryUpload = React.useCallback(() => {
            // Clear any previous error state
            setUploadError(null)
            setShowCheck(false)
            
            // Reset file input to allow selecting the same file again
            if (fileInputRef.current) {
                fileInputRef.current.value = ''
                fileInputRef.current.click()
            }
        }, [])

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
                            inputClassName,
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
                            className="inline-flex h-6 w-6 items-center justify-center rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <Upload className="h-4 w-4" />
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept={accept}
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
                        <div className="flex-1">
                            <p>{uploadError}</p>
                            <div className="mt-2 flex gap-2">
                                <button
                                    type="button"
                                    onClick={retryUpload}
                                    className="text-xs px-2 py-1 bg-destructive/10 hover:bg-destructive/20 rounded transition-colors"
                                >
                                    Retry Upload
                                </button>
                                <button
                                    type="button"
                                    onClick={clearError}
                                    className="text-xs px-2 py-1 bg-muted hover:bg-muted/80 rounded transition-colors"
                                >
                                    Clear Error
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </>
        )
    }
)
LinkOrDrop.displayName = "LinkOrDrop"

export { LinkOrDrop }
