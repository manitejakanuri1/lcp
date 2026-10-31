import { useCallback, useState } from 'react'
import { compressImage } from '../lib/imageUpload/compress'
import type { CompressionStrategy } from '../lib/imageUpload/types'

type CompressorStatus = 'idle' | 'compressing' | 'done' | 'error'

/**
 * Binary manipulation only: file in, small WebP blob out. Knows nothing about the network or
 * the screen. The work happens in a Web Worker (see compress.ts), so `compress` can take a
 * 100 MB camera file without freezing the page.
 */
export function useImageCompressor(strategy: CompressionStrategy = 'ecommerce') {
    const [status, setStatus] = useState<CompressorStatus>('idle')
    const [error, setError] = useState<Error | null>(null)

    const compress = useCallback(async (file: File): Promise<Blob> => {
        setStatus('compressing')
        setError(null)
        try {
            const blob = await compressImage(file, strategy)
            setStatus('done')
            return blob
        } catch (err) {
            const e = err instanceof Error ? err : new Error('Could not read that photo')
            setError(e)
            setStatus('error')
            throw e
        }
    }, [strategy])

    const reset = useCallback(() => { setStatus('idle'); setError(null) }, [])

    return { compress, status, error, reset }
}
