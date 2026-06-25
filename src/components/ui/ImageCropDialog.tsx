"use client"

import * as React from "react"
import Cropper, { Area } from "react-easy-crop"
import { ZoomIn, ZoomOut, Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./dialog"
import { Button } from "./button"
import { renderCroppedImageFile } from "@/lib/utils/normalizeImage"

const MIN_ZOOM = 0.4
const MAX_ZOOM = 4
const ZOOM_STEP = 0.2

export interface ImageCropDialogProps {
    /** The image to crop. When non-null the dialog is open. */
    file: File | null
    /** Frame shape: square for logos, round for avatars/photos. Defaults to 'rect'. */
    cropShape?: "rect" | "round"
    /** Output square dimension in pixels. Defaults to 512. */
    outputSize?: number
    /** Dialog title. */
    title?: string
    confirmLabel?: string
    cancelLabel?: string
    onCancel: () => void
    onConfirm: (file: File) => void
}

export function ImageCropDialog({
    file,
    cropShape = "rect",
    outputSize = 512,
    title = "Adjust image",
    confirmLabel = "Save",
    cancelLabel = "Cancel",
    onCancel,
    onConfirm,
}: ImageCropDialogProps) {
    const [imageUrl, setImageUrl] = React.useState<string | null>(null)
    const [crop, setCrop] = React.useState({ x: 0, y: 0 })
    const [zoom, setZoom] = React.useState(1)
    const [croppedAreaPixels, setCroppedAreaPixels] = React.useState<Area | null>(null)
    const [isProcessing, setIsProcessing] = React.useState(false)

    // Create (and clean up) an object URL for the selected file. Reset the
    // crop/zoom state each time a new file comes in.
    React.useEffect(() => {
        if (!file) {
            setImageUrl(null)
            return
        }
        const url = URL.createObjectURL(file)
        setImageUrl(url)
        setCrop({ x: 0, y: 0 })
        setZoom(1)
        setCroppedAreaPixels(null)
        return () => URL.revokeObjectURL(url)
    }, [file])

    const onCropComplete = React.useCallback((_: Area, areaPixels: Area) => {
        setCroppedAreaPixels(areaPixels)
    }, [])

    const adjustZoom = React.useCallback((delta: number) => {
        setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number((z + delta).toFixed(2)))))
    }, [])

    const handleConfirm = React.useCallback(async () => {
        if (!file || !croppedAreaPixels) return
        setIsProcessing(true)
        try {
            const result = await renderCroppedImageFile(file, croppedAreaPixels, { size: outputSize })
            onConfirm(result)
        } finally {
            setIsProcessing(false)
        }
    }, [file, croppedAreaPixels, outputSize, onConfirm])

    return (
        <Dialog open={!!file} onOpenChange={(open) => { if (!open) onCancel() }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                </DialogHeader>

                <div className="relative w-full h-72 rounded-md overflow-hidden bg-white">
                    {imageUrl && (
                        <Cropper
                            image={imageUrl}
                            crop={crop}
                            zoom={zoom}
                            aspect={1}
                            cropShape={cropShape}
                            showGrid={cropShape === "rect"}
                            minZoom={MIN_ZOOM}
                            maxZoom={MAX_ZOOM}
                            zoomSpeed={0.2}
                            restrictPosition={false}
                            objectFit="contain"
                            onCropChange={setCrop}
                            onZoomChange={setZoom}
                            onCropComplete={onCropComplete}
                            style={{ containerStyle: { background: "#ffffff" } }}
                        />
                    )}
                </div>

                <div className="flex items-center justify-center gap-4 pt-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => adjustZoom(-ZOOM_STEP)}
                        aria-label="Zoom out"
                    >
                        <ZoomOut className="h-4 w-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => adjustZoom(ZOOM_STEP)}
                        aria-label="Zoom in"
                    >
                        <ZoomIn className="h-4 w-4" />
                    </Button>
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={onCancel} disabled={isProcessing}>
                        {cancelLabel}
                    </Button>
                    <Button type="button" onClick={handleConfirm} disabled={!croppedAreaPixels || isProcessing}>
                        {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {confirmLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
