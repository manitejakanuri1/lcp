import { useState, useEffect } from 'react';

interface ProductThumbnailProps {
    imageUrl: string | null | undefined;
    alt: string;
    /** Sizing and rounding are the caller's choice — this only handles the fallback. */
    className?: string;
}

/**
 * Shows the saree photo stored on products.image_url by ProductPhotoUpload.
 * Falls back to a placeholder when there is no photo, or when the saved URL fails
 * to load — e.g. the file was removed from the product-photos bucket.
 */
export function ProductThumbnail({ imageUrl, alt, className = '' }: ProductThumbnailProps) {
    const [failed, setFailed] = useState(false);

    // A new upload swaps the URL, so give the replacement its own chance to load.
    useEffect(() => setFailed(false), [imageUrl]);

    if (!imageUrl || failed) {
        return (
            <div
                className={`flex flex-col items-center justify-center gap-1 bg-[var(--color-surface)] border border-dashed border-[var(--color-border)] text-[var(--color-text-muted)] ${className}`}
            >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-[10px] font-medium">No photo</span>
            </div>
        );
    }

    return (
        <img
            src={imageUrl}
            alt={alt}
            loading="lazy"
            onError={() => setFailed(true)}
            className={`object-cover bg-[var(--color-surface)] ${className}`}
        />
    );
}
