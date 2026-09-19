import { lazy, type ComponentType } from 'react'

/** How long to wait for a page chunk before treating the download as stuck. */
const CHUNK_TIMEOUT_MS = 12000

/**
 * React.lazy with a deadline.
 *
 * A failed chunk download is recoverable — the promise rejects, the error
 * boundary catches it and reloads. A *hanging* one is not: a service worker that
 * claims the request and never answers leaves the promise pending forever, and
 * <Suspense> has nothing to do but show its fallback for good. That is the
 * spinner-with-no-error case, and no error boundary can see it, because nothing
 * was ever thrown.
 *
 * Racing the import against a timer converts that silence into a rejection the
 * boundary can act on.
 */
export function lazyPage<T extends ComponentType<unknown>>(
    loader: () => Promise<{ default: T }>
) {
    return lazy(() =>
        Promise.race([
            loader(),
            new Promise<never>((_, reject) =>
                setTimeout(
                    () => reject(new Error('Loading chunk timed out')),
                    CHUNK_TIMEOUT_MS
                )
            ),
        ])
    )
}

/** Pulls a named export out of a module so it can be used with lazyPage. */
export function named<T extends ComponentType<never>>(
    loader: () => Promise<Record<string, unknown>>,
    exportName: string
) {
    return () =>
        loader().then((m) => ({ default: m[exportName] as T }))
}
