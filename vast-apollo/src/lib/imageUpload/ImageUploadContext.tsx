import { createContext, useContext, type ReactNode } from 'react'
import { apiImageClient } from '../api'
import type { ImageUploadClient } from './types'

// Dependency inversion: the hooks ask the context for a client instead of importing an
// endpoint, so a test (or a different storage provider) supplies its own.
const ImageUploadContext = createContext<ImageUploadClient>(apiImageClient)

export function ImageUploadProvider({ client, children }: { client: ImageUploadClient; children: ReactNode }) {
    return <ImageUploadContext.Provider value={client}>{children}</ImageUploadContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useImageUploadClient = () => useContext(ImageUploadContext)
