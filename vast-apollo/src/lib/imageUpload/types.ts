// The contracts the upload pieces agree on. Nothing here knows about React, axios or Google.

export type ImageKind = 'product' | 'colour'

/** What a compression strategy produces. New strategies are added to compress.ts, not the worker. */
export type CompressionStrategy = 'ecommerce' | 'avatar'

export interface Handshake {
    imageId: string
    uploadUrl: string
    /** Headers that are part of the signature; the PUT must send exactly these. */
    headers: Record<string, string>
    expiresAt: string
}

export interface HandshakeRequest {
    kind: ImageKind
    ownerId: string
    mimeType: string
    size: number
}

export type ImageStatus =
    | { status: 'processing' }
    | { status: 'ready'; url: string }
    | { status: 'failed' }

/**
 * The only thing the upload hooks need from the outside world. Swapping the storage provider
 * means writing another one of these (the server hands out whatever URL its provider signs),
 * not touching the hooks.
 */
export interface ImageUploadClient {
    requestUploadUrl(req: HandshakeRequest): Promise<Handshake>
    getImageStatus(imageId: string): Promise<ImageStatus>
}

export type UploaderPhase =
    | 'idle'
    | 'compressing'
    | 'requesting_signature'
    | 'uploading'
    | 'processing'
    | 'complete'
    | 'error'

export interface UploadedImage {
    /** Pass to the save route (image_id); the server turns it into the stored URL. */
    imageId: string
    /** The largest size, ready to display. */
    url: string
}
