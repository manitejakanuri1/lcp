import axios, { AxiosError } from 'axios'
import axiosRetry from 'axios-retry'
import type { Handshake } from './types'

// One axios instance for the PUT only, so the retry policy cannot leak onto other calls.
const storageHttp = axios.create({ timeout: 120_000 })
axiosRetry(storageHttp, {
    retries: 4,
    // 1s, 2s, 4s, 8s - mobile data drops for seconds, not milliseconds.
    retryDelay: axiosRetry.exponentialDelay,
    // PUT is idempotent, so a repeat of a half-sent upload is safe. A 403 is not retried here:
    // it means the signed URL expired, which needs a fresh handshake, not the same URL again.
    retryCondition: (err) => axiosRetry.isNetworkError(err) || (err.response?.status ?? 0) >= 500,
})

export class SignatureExpiredError extends Error {
    constructor() {
        super('The upload link expired')
        this.name = 'SignatureExpiredError'
    }
}

/** PUT the shrunken photo straight to storage. Reports 0-100 as bytes leave the phone. */
export async function putToStorage(
    handshake: Handshake,
    blob: Blob,
    onProgress?: (percent: number) => void,
    signal?: AbortSignal,
): Promise<void> {
    try {
        await storageHttp.put(handshake.uploadUrl, blob, {
            headers: handshake.headers,
            signal,
            onUploadProgress: (e) => {
                if (e.total) onProgress?.(Math.round((e.loaded / e.total) * 100))
            },
        })
    } catch (err) {
        if (err instanceof AxiosError && err.response?.status === 403) throw new SignatureExpiredError()
        throw err
    }
}
