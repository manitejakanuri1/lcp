import { useState, useRef } from 'react';
import { productsApi } from '../../lib/api';

interface ProductPhotoUploadProps {
    productId: string;
    currentImageUrl: string | null;
    onPhotoChanged: (imageUrl: string | null) => void;
}

/**
 * Uploads a saree photo for a product. The photo goes to the `product-photos`
 * bucket and its URL is saved on products.image_url, which is what the
 * storefront displays — so uploading here replaces the stock placeholder online.
 */
export function ProductPhotoUpload({ productId, currentImageUrl, onPhotoChanged }: ProductPhotoUploadProps) {
    const [isUploading, setIsUploading] = useState(false);
    const [isRemoving, setIsRemoving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            setError('Invalid file type. Please upload a JPG, PNG or WEBP image.');
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            setError('File too large. Maximum size is 10MB.');
            return;
        }

        setError(null);
        setIsUploading(true);

        const reader = new FileReader();
        reader.onload = (ev) => setPreview(ev.target?.result as string);
        reader.readAsDataURL(file);

        try {
            const response = await productsApi.uploadPhoto(productId, file);
            onPhotoChanged(response.image_url);
            setPreview(null);
        } catch (err) {
            console.error('[ProductPhoto] Upload error:', err);
            setPreview(null);

            let errorMessage = 'Failed to upload photo';
            if (err instanceof Error) {
                if (err.message.includes('Product not found')) {
                    errorMessage = 'This product no longer exists. Refresh and try again.';
                } else if (err.message.includes('storage')) {
                    errorMessage = '💾 Storage error. Check the product-photos bucket exists and is public.';
                } else if (err.message.includes('Session expired') || err.message.includes('Unauthorized')) {
                    errorMessage = '🔒 Session expired. Please log in again.';
                } else {
                    errorMessage = `❌ ${err.message}`;
                }
            }
            setError(errorMessage);
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const handleRemove = async () => {
        setError(null);
        setIsRemoving(true);
        try {
            await productsApi.deletePhoto(productId);
            onPhotoChanged(null);
        } catch (err) {
            setError(err instanceof Error ? `❌ ${err.message}` : 'Failed to remove photo');
        } finally {
            setIsRemoving(false);
        }
    };

    const displayImage = preview || currentImageUrl;

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-[var(--color-text)]">Website Photo</h4>
                {currentImageUrl && !isUploading && (
                    <button
                        type="button"
                        onClick={handleRemove}
                        disabled={isRemoving}
                        className="text-xs text-[var(--color-danger-text)] hover:underline disabled:opacity-50"
                    >
                        {isRemoving ? 'Removing…' : 'Remove'}
                    </button>
                )}
            </div>

            <div
                onClick={() => !isUploading && fileInputRef.current?.click()}
                className={`
                    border-2 border-dashed rounded-xl p-4 text-center cursor-pointer
                    transition-all duration-200
                    ${isUploading
                        ? 'border-indigo-500 bg-indigo-500/10'
                        : 'border-[var(--color-border)] hover:border-indigo-500 hover:bg-indigo-500/5'
                    }
                `}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/jpg,image/webp"
                    capture="environment"
                    onChange={handleFileSelect}
                    className="hidden"
                />

                <div className="space-y-2">
                    {displayImage ? (
                        <img
                            src={displayImage}
                            alt="Saree"
                            className="mx-auto max-h-40 rounded-lg object-contain"
                        />
                    ) : (
                        <svg className="mx-auto h-10 w-10 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    )}

                    {isUploading ? (
                        <div className="flex items-center justify-center gap-2">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-500"></div>
                            <p className="text-sm font-medium text-indigo-500">Uploading photo…</p>
                        </div>
                    ) : (
                        <div>
                            <p className="text-sm font-medium text-[var(--color-text)]">
                                {currentImageUrl ? 'Tap to replace photo' : 'Take or upload a photo'}
                            </p>
                            <p className="text-xs text-[var(--color-text-muted)]">
                                Shown on the website (max 10MB)
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-500">
                    {error}
                </div>
            )}
        </div>
    );
}
