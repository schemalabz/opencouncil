'use client'

import * as React from "react"
import { cn } from "../../lib/utils"
import { Input } from "./input"
import { Check, Loader2, Upload } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "./button"

export interface LinkOrDropProps
    extends React.InputHTMLAttributes<HTMLInputElement> {
    onUrlChange?: (url: string) => void
}

const LinkOrDrop = React.forwardRef<HTMLInputElement, LinkOrDropProps>(
    ({ className, onUrlChange, ...props }, ref) => {
        const [isDragging, setIsDragging] = React.useState(false)
        const [isUploading, setIsUploading] = React.useState(false)
        const [showCheck, setShowCheck] = React.useState(false)
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
            try {
                const formData = new FormData()
                formData.append('file', file)

                const response = await fetch('/api/upload', {
                    method: 'POST',
                    body: formData,
                })

                if (!response.ok) {
                    throw new Error('Upload failed')
                }

                const { url } = await response.json()
                if (combinedRef.current) {
                    combinedRef.current.value = url
                }
                onUrlChange?.(url)
                setShowCheck(true)
                setTimeout(() => setShowCheck(false), 2000)
            } catch (error) {
                console.error('Upload error:', error)
            } finally {
                setIsUploading(false)
            }
        }, [combinedRef, onUrlChange])

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
                    className="pr-20"
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
        )
    }
)
LinkOrDrop.displayName = "LinkOrDrop"

export { LinkOrDrop }
