import { useState, useRef, useEffect } from 'react';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
const MAX_BYTES = 10 * 1024 * 1024;

interface PhotoPickerProps {
    file: File | null;
    onChange: (file: File | null) => void;
    disabled?: boolean;
}

/**
 * Picks a photo and holds it locally — nothing is sent anywhere.
 *
 * Used when adding a product, where there is no product id to upload against yet.
 * The parent creates the product first, then hands this file to productsApi.uploadPhoto.
 * For products that already exist, use ProductPhotoUpload instead.
 */
export function PhotoPicker({ file, onChange, disabled = false }: PhotoPickerProps) {
    const [error, setError] = useState<string | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Object URLs have to be released by hand or the blobs leak.
    useEffect(() => {
        if (!file) {
            setPreview(null);
            return;
        }
        const url = URL.createObjectURL(file);
        setPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [file]);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selected = e.target.files?.[0];
        if (fileInputRef.current) fileInputRef.current.value = '';
        if (!selected) return;

        if (!ALLOWED_TYPES.includes(selected.type)) {
            setError('Invalid file type. Please choose a JPG, PNG or WEBP image.');
            return;
        }
        if (selected.size > MAX_BYTES) {
            setError('File too large. Maximum size is 10MB.');
            return;
        }

        setError(null);
        onChange(selected);
    };

    const handleClear = () => {
        setError(null);
        onChange(null);
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-[var(--color-text)]">Website Photo</h4>
                {file && !disabled && (
                    <button
                        type="button"
                        onClick={handleClear}
                        className="text-xs text-[var(--color-danger-text)] hover:underline"
                    >
                        Clear
                    </button>
                )}
            </div>

            <div
                onClick={() => !disabled && fileInputRef.current?.click()}
                className={`
                    border-2 border-dashed rounded-xl p-4 text-center
                    transition-all duration-200
                    ${disabled
                        ? 'border-[var(--color-border)] opacity-60 cursor-not-allowed'
                        : 'border-[var(--color-border)] hover:border-indigo-500 hover:bg-indigo-500/5 cursor-pointer'
                    }
                `}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/jpg,image/webp"
                    capture="environment"
                    onChange={handleFileSelect}
                    disabled={disabled}
                    className="hidden"
                />

                <div className="space-y-2">
                    {preview ? (
                        <img src={preview} alt="Saree" className="mx-auto max-h-40 rounded-lg object-contain" />
                    ) : (
                        <svg className="mx-auto h-10 w-10 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    )}

                    <div>
                        <p className="text-sm font-medium text-[var(--color-text)]">
                            {file ? 'Tap to choose a different photo' : 'Take or upload a photo (optional)'}
                        </p>
                        <p className="text-xs text-[var(--color-text-muted)]">
                            Uploaded when you save the product (max 10MB)
                        </p>
                    </div>
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
