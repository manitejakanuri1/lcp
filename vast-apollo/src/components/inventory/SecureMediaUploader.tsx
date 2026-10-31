import { useRef, useState } from 'react'
import { useImageCompressor } from '../../hooks/useImageCompressor'
import { usePresignedUpload } from '../../hooks/usePresignedUpload'
import type { CompressionStrategy, ImageKind, UploadedImage, UploaderPhase } from '../../lib/imageUpload/types'

interface SecureMediaUploaderProps {
    kind: ImageKind
    /** The saree the photo is for (for a colour too). */
    ownerId: string
    /** Refuse anything bigger before even trying to shrink it. */
    maxSizeBytes?: number
    strategy?: CompressionStrategy
    /**
     * Gets the image id as well as the URL: the id is what the save route needs, because the
     * server only trusts a photo it issued the upload link for.
     */
    onUploadSuccess: (image: UploadedImage) => void
    onUploadError?: (error: Error) => void
    disabled?: boolean
    label?: string
}

const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif'

const PHASE_TEXT: Record<UploaderPhase, string> = {
    idle: '',
    compressing: 'Shrinking photo…',
    requesting_signature: 'Preparing upload…',
    uploading: 'Uploading…',
    processing: 'Making sizes…',
    complete: 'Done',
    error: '',
}

/**
 * Renders the picker and the progress; everything else is in the two hooks. State machine:
 * idle -> compressing -> requesting_signature -> uploading -> processing -> complete
 * (any step can fall to error, which returns to idle on the next pick).
 */
export function SecureMediaUploader({
    kind, ownerId, maxSizeBytes = 100 * 1024 * 1024, strategy = 'ecommerce',
    onUploadSuccess, onUploadError, disabled = false, label = 'Take or upload a photo',
}: SecureMediaUploaderProps) {
    const compressor = useImageCompressor(strategy)
    const uploader = usePresignedUpload(kind, ownerId)
    const input = useRef<HTMLInputElement>(null)
    const [message, setMessage] = useState<string | null>(null)

    // Compression runs first and has its own status; after that the uploader's phase leads.
    const phase: UploaderPhase = compressor.status === 'compressing' ? 'compressing' : uploader.phase
    const busy = phase !== 'idle' && phase !== 'error' && phase !== 'complete'

    const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (input.current) input.current.value = ''
        if (!file) return

        setMessage(null)
        uploader.reset()
        compressor.reset()
        if (file.size > maxSizeBytes) {
            const err = new Error(`That photo is too large (limit ${Math.round(maxSizeBytes / (1024 * 1024))} MB).`)
            setMessage(err.message)
            onUploadError?.(err)
            return
        }

        try {
            const blob = await compressor.compress(file)
            const image = await uploader.upload(blob)
            onUploadSuccess(image)
        } catch (err) {
            const e2 = err instanceof Error ? err : new Error('Upload failed')
            setMessage(e2.message)
            onUploadError?.(e2)
        }
    }

    return (
        <div className="space-y-2">
            <button
                type="button"
                disabled={disabled || busy}
                onClick={() => input.current?.click()}
                className="w-full rounded-xl border-2 border-dashed border-[var(--color-border)] p-4 text-center text-sm font-medium text-[var(--color-text)] hover:border-indigo-500 hover:bg-indigo-500/5 disabled:opacity-60"
            >
                {busy ? PHASE_TEXT[phase] : label}
            </button>
            <input ref={input} type="file" accept={ACCEPT} onChange={pick} className="hidden" />

            {phase === 'uploading' && (
                <div className="h-1.5 w-full overflow-hidden rounded bg-[var(--color-border)]" role="progressbar" aria-valuenow={uploader.progress} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full bg-indigo-500 transition-all" style={{ width: `${uploader.progress}%` }} />
                </div>
            )}

            {message && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">{message}</div>
            )}
        </div>
    )
}
