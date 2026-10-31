import imageCompression from 'browser-image-compression'
import type { CompressionStrategy } from './types'

// Each strategy is just numbers, so a new use of the uploader (say a staff avatar) adds a row
// here and leaves the worker and the hook alone.
interface StrategyOptions {
    maxWidthOrHeight: number
    maxSizeMB: number
    initialQuality: number
}

const STRATEGIES: Record<CompressionStrategy, StrategyOptions> = {
    // A saree is judged on its weave and zari: keep 2500px, let the size settle under 1 MB.
    ecommerce: { maxWidthOrHeight: 2500, maxSizeMB: 1, initialQuality: 0.85 },
    avatar: { maxWidthOrHeight: 512, maxSizeMB: 0.1, initialQuality: 0.8 },
}

export class UnsupportedImageError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'UnsupportedImageError'
    }
}

/**
 * Shrink a photo to a WebP in a Web Worker. The library decodes with createImageBitmap and
 * draws on an OffscreenCanvas inside the worker, so a 100 MB camera file never blocks the
 * screen. Throws UnsupportedImageError for something the browser cannot decode (HEIC on most
 * desktops), so the screen can say so instead of showing a raw decoder message.
 */
export async function compressImage(
    file: File,
    strategy: CompressionStrategy = 'ecommerce',
    onProgress?: (percent: number) => void,
): Promise<Blob> {
    if (!file.type.startsWith('image/')) {
        throw new UnsupportedImageError('That file is not a picture.')
    }
    const options = STRATEGIES[strategy]
    try {
        return await imageCompression(file, {
            ...options,
            useWebWorker: true,
            fileType: 'image/webp',
            // The library keeps EXIF orientation by rotating pixels before encode.
            preserveExif: false,
            onProgress,
        })
    } catch (err) {
        throw new UnsupportedImageError(
            err instanceof Error && err.message
                ? `This photo could not be read (${err.message}). Try a JPG or PNG.`
                : 'This photo could not be read. Try a JPG or PNG.',
        )
    }
}
