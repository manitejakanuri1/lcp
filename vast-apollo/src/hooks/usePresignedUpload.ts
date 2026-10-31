import { useCallback, useRef, useState } from 'react'
import { useImageUploadClient } from '../lib/imageUpload/ImageUploadContext'
import { sendCompressed } from '../lib/imageUpload/uploadImage'
import type { ImageKind, UploadedImage, UploaderPhase } from '../lib/imageUpload/types'

/**
 * Networking only: signed-URL handshake, the PUT with retries, and waiting for the sizes.
 * The endpoint comes from the injected client, never from this file.
 */
export function usePresignedUpload(kind: ImageKind, ownerId: string) {
    const client = useImageUploadClient()
    const [phase, setPhase] = useState<UploaderPhase>('idle')
    const [progress, setProgress] = useState(0)
    const [error, setError] = useState<Error | null>(null)
    const abort = useRef<AbortController | null>(null)

    const upload = useCallback(async (blob: Blob): Promise<UploadedImage> => {
        abort.current?.abort()
        const controller = new AbortController()
        abort.current = controller
        setError(null)
        setProgress(0)
        try {
            return await sendCompressed(blob, {
                client, kind, ownerId, signal: controller.signal,
                onPhase: setPhase, onProgress: setProgress,
            })
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Upload failed'))
            setPhase('error')
            throw err
        }
    }, [client, kind, ownerId])

    const cancel = useCallback(() => { abort.current?.abort(); setPhase('idle') }, [])
    const reset = useCallback(() => { setPhase('idle'); setProgress(0); setError(null) }, [])

    return { upload, cancel, reset, phase, progress, error }
}
