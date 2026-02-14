import { useState, useRef } from 'react';
import { Button } from '../ui';
import type { BillExtractedData } from '../../lib/api';

interface BillImageUploadProps {
    onDataExtracted: (data: BillExtractedData) => void;
}

export function BillImageUpload({ onDataExtracted }: BillImageUploadProps) {
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
        const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
        if (!allowedTypes.includes(file.type)) {
            setError('Invalid file type. Please upload JPG, PNG, or PDF.');
            return;
        }

        // Validate file size (10MB max)
        if (file.size > 10 * 1024 * 1024) {
            setError('File too large. Maximum size is 10MB.');
            return;
        }

        setError(null);
        setIsUploading(true);

        // Show preview for images
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => setPreview(e.target?.result as string);
            reader.readAsDataURL(file);
        }

        try {
            const { inventoryApi } = await import('../../lib/api');
            const response = await inventoryApi.uploadBill(file);

            if (response.success) {
                onDataExtracted(response.extracted_data);
                setPreview(null);
            } else {
                setError('Failed to extract data from bill image');
            }
        } catch (err) {
            console.error('Upload error:', err);

            // Provide detailed error messages
            let errorMessage = 'Failed to upload and process bill';

            if (err instanceof Error) {
                if (err.message.includes('Access denied') || err.message.includes('Unauthorized')) {
                    errorMessage = '🔒 Authentication error. Please log out and log in again.';
                } else if (err.message.includes('Failed to upload image to storage')) {
                    errorMessage = '💾 Storage error. Check Supabase storage bucket configuration.';
                } else if (err.message.includes('Failed to extract structured data')) {
                    errorMessage = '🤖 AI extraction failed. Try a clearer image or different bill.';
                } else if (err.message.includes('ANTHROPIC_API_KEY')) {
                    errorMessage = '🔑 API key missing. Contact administrator to configure Anthropic API key.';
                } else if (err.message.includes('Network') || err.message.includes('fetch')) {
                    errorMessage = '🌐 Network error. Check your internet connection.';
                } else {
                    errorMessage = `❌ ${err.message}`;
                }
            }

            setError(errorMessage);
        } finally {
            setIsUploading(false);
            // Reset file input
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) {
            // Simulate file input change
            const input = fileInputRef.current;
            if (input) {
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);
                input.files = dataTransfer.files;
                handleFileSelect({ target: input } as any);
            }
        }
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
    };

    return (
        <div className="space-y-3">
            <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={() => fileInputRef.current?.click()}
                className={`
                    border-2 border-dashed rounded-xl p-6 text-center cursor-pointer
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
                    accept="image/jpeg,image/png,image/jpg,application/pdf"
                    onChange={handleFileSelect}
                    className="hidden"
                />

                <div className="space-y-2">
                    {preview ? (
                        <img src={preview} alt="Bill preview" className="mx-auto max-h-32 rounded-lg" />
                    ) : (
                        <svg className="mx-auto h-12 w-12 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                    )}

                    {isUploading ? (
                        <div>
                            <div className="flex items-center justify-center gap-2 mb-2">
                                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-500"></div>
                                <p className="text-sm font-medium text-indigo-500">Processing bill image...</p>
                            </div>
                            <p className="text-xs text-[var(--color-text-muted)]">
                                Extracting vendor details and product information
                            </p>
                        </div>
                    ) : (
                        <div>
                            <p className="text-sm font-medium text-[var(--color-text)]">
                                Upload Bill Image or PDF
                            </p>
                            <p className="text-xs text-[var(--color-text-muted)]">
                                Drag & drop or click to browse (Max 10MB)
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
