import { compressImage } from './compress'
import { putToStorage, SignatureExpiredError } from './transport'
import type {
    CompressionStrategy, ImageKind, ImageUploadClient, UploadedImage, UploaderPhase,
} from './types'

export interface SendOptions {
    client: ImageUploadClient
    kind: ImageKind
    /** The saree (for a colour too: the colour row may not exist yet). */
    ownerId: string
    signal?: AbortSignal
    onPhase?: (phase: UploaderPhase) => void
    /** 0-100 of the PUT only; other stages report through onPhase. */
    onProgress?: (percent: number) => void
}

export interface UploadImageOptions extends SendOptions {
    file: File
    strategy?: CompressionStrategy
}

// The API's own give-up is three minutes; polling past that would only repeat its answer.
const POLL_EVERY_MS = 1000
const POLL_UNTIL_MS = 60_000

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')) }, { once: true })
})

/**
 * Everything after compression: ask for a signed URL, PUT, wait for the sizes. This is the
 * networking half that usePresignedUpload wraps; plain async so non-React callers share it.
 */
export async function sendCompressed(blob: Blob, opts: SendOptions): Promise<UploadedImage> {
    const { client, kind, ownerId, signal, onPhase, onProgress } = opts

    // An expired link (a slow upload on bad data, or a phone that slept) costs one fresh
    // handshake, not the whole operation; a second expiry is a real problem and surfaces.
    let handshake
    for (let attempt = 0; ; attempt++) {
        onPhase?.('requesting_signature')
        handshake = await client.requestUploadUrl({ kind, ownerId, mimeType: 'image/webp', size: blob.size })
        onPhase?.('uploading')
        try {
            await putToStorage(handshake, blob, onProgress, signal)
            break
        } catch (err) {
            if (!(err instanceof SignatureExpiredError) || attempt >= 1) throw err
        }
    }

    onPhase?.('processing')
    const deadline = Date.now() + POLL_UNTIL_MS
    while (Date.now() < deadline) {
        const state = await client.getImageStatus(handshake.imageId)
        if (state.status === 'ready') {
            onPhase?.('complete')
            return { imageId: handshake.imageId, url: state.url }
        }
        if (state.status === 'failed') break
        await sleep(POLL_EVERY_MS, signal)
    }
    throw new Error('The photo was uploaded but could not be prepared. Please try again.')
}

/** The whole pipeline in one call: shrink, then send. */
export async function uploadImage(opts: UploadImageOptions): Promise<UploadedImage> {
    opts.onPhase?.('compressing')
    const blob = await compressImage(opts.file, opts.strategy)
    return sendCompressed(blob, opts)
}
