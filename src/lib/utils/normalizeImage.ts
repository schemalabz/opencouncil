export interface CroppedAreaPixels {
    x: number
    y: number
    width: number
    height: number
}

export interface RenderCropOptions {
    /** Output square dimension in pixels. Defaults to 512. */
    size?: number
    /** Background/padding color (any CSS color). Defaults to white. */
    background?: string
}

/**
 * Renders a cropped region of an image onto a square canvas with a solid
 * (white by default) background and returns it as a PNG File.
 *
 * The crop region (in the source image's natural pixels, as produced by
 * react-easy-crop) is mapped to fill the output square. When the user has
 * zoomed out so the crop window extends beyond the image bounds, the
 * uncovered area keeps the background color — i.e. the image is padded with
 * white instead of being cropped. Any transparency in the source is flattened
 * onto the background as well.
 */
export async function renderCroppedImageFile(
    file: File,
    croppedAreaPixels: CroppedAreaPixels,
    options: RenderCropOptions = {}
): Promise<File> {
    const { size = 512, background = '#ffffff' } = options

    const image = await loadImage(file)

    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size

    const ctx = canvas.getContext('2d')
    if (!ctx) {
        throw new Error('Could not obtain 2D canvas context')
    }

    // Fill the background first so transparent areas and padding become solid.
    ctx.fillStyle = background
    ctx.fillRect(0, 0, size, size)

    // Map the crop window to the full canvas. Rather than using drawImage's
    // source-rectangle cropping (which mishandles regions outside the image),
    // scale the whole image and translate it so the crop window aligns to the
    // canvas. Anything outside the image simply isn't drawn and stays white.
    const scale = size / croppedAreaPixels.width
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(
        image,
        -croppedAreaPixels.x * scale,
        -croppedAreaPixels.y * scale,
        image.width * scale,
        image.height * scale
    )

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) {
        throw new Error('Canvas toBlob returned null')
    }

    const baseName = file.name.replace(/\.[^/.]+$/, '') || 'image'
    return new File([blob], `${baseName}.png`, { type: 'image/png' })
}

export function loadImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file)
        const image = new window.Image()
        image.onload = () => {
            URL.revokeObjectURL(url)
            resolve(image)
        }
        image.onerror = () => {
            URL.revokeObjectURL(url)
            reject(new Error('Could not load image'))
        }
        image.src = url
    })
}
